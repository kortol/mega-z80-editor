/* Serial check: intentionally rebuilds managed runtime output, then restores it. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist", "scc", "runtime");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-numeric-build-"));
const run = (args, modules) => execFileSync("pnpm", args, {
  cwd: root, stdio: "pipe", shell: process.platform === "win32",
  env: { ...process.env, MZ80_NUMERIC_MODULES: modules }, timeout: 120000,
});
try {
  const dependencyDirectory=path.join(temp,'dependencies');fs.mkdirSync(dependencyDirectory);
  for(const name of ['core','assembler'])execFileSync('pnpm',['pack','--pack-destination',dependencyDirectory],{
    cwd:path.resolve(root,'..',name),stdio:'pipe',shell:process.platform==='win32',timeout:120000,
  });
  for (const modules of ["none", "fixed", "bcd", "fixed,bcd"]) {
    const selected = modules === "none" ? [] : modules.split(",");
    // A source checkout with unselected module directories physically absent
    // must still copy successfully. Use a fixture instead of moving live sources.
    const fixture = path.join(temp, modules.replace(/,/g, "-"));
    const fixtureSource = path.join(fixture, "src", "scc", "runtime");
    fs.mkdirSync(path.join(fixture, "tools"), { recursive: true });
    fs.mkdirSync(fixtureSource, { recursive: true });
    for(const entry of fs.readdirSync(path.join(root,'src/scc/runtime')))if(entry!=='numeric')fs.cpSync(path.join(root,'src/scc/runtime',entry),path.join(fixtureSource,entry),{recursive:true});
    for (const feature of selected) fs.cpSync(path.join(root, "src", "scc", "runtime", "numeric", feature), path.join(fixtureSource, "numeric", feature), { recursive: true });
    const copyScript = path.join(fixture, "tools", "copy-runtime.js");
    fs.copyFileSync(path.join(root, "tools", "copy-runtime.js"), copyScript);
    execFileSync(process.execPath, [copyScript], { env: { ...process.env, MZ80_NUMERIC_MODULES: modules } });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, "dist", "scc", "runtime", "numeric", "available.json"))).features, selected);
    // prepack must preserve the same module selection, not silently restore all.
    run(["pack", "--pack-destination", temp], modules);
    const tgz = path.join(temp, fs.readdirSync(temp).find((name) => name.endsWith(".tgz")));
    const entries = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" });
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "numeric", "available.json")));
    assert.deepEqual(manifest.features, selected);
    for (const name of ["fixed", "bcd"]) {
      assert.equal(fs.existsSync(path.join(output, "numeric", name)), selected.includes(name));
      assert.equal(entries.includes(`runtime/numeric/${name}/constructors.scc.asm`), selected.includes(name));
      assert.equal(entries.includes(`runtime/numeric/${name}/include/mz80_${name}.h`), selected.includes(name));
      assert.equal(entries.includes(`runtime/artifacts/libmz80-${name}-v1.lib`), selected.includes(name));
    }
    for (const feature of ['fixed','bcd'])for (const member of ["common", "conversion", "arithmetic", "comparison", "multiply", "divide", "parse", "format"]) {
      assert.equal(entries.includes(`runtime/numeric/${feature}/${member}.c`), selected.includes(feature));
      assert.equal(entries.includes(`runtime/numeric/${feature}/${member}.generated.scc.asm`), selected.includes(feature));
    }
    // Each fresh child loads only the currently packaged capabilities.
    execFileSync(process.execPath, ["-e", [
      "const assert=require('node:assert/strict');",
      "const api=require('./dist');",
      `assert.deepEqual(api.availableNumericFeatures(),${JSON.stringify(selected)});`,
      ...["fixed", "bcd"].map((feature) => selected.includes(feature)
        ? `assert.ok(api.getBundledRuntimeArtifacts({platform:'cpm',profile:'lite',features:['${feature}']}).libraryPaths.length);`
        : `assert.throws(()=>api.getBundledRuntimeArtifacts({platform:'cpm',profile:'lite',features:['${feature}']}),/not included/);`),
      "assert.equal(api.getBundledRuntimeArtifacts({platform:'cpm',profile:'lite'}).libraryPaths.length,0);",
    ].join("\n")], { cwd: root, stdio: "inherit" });
    const install=path.join(temp,'install-'+modules.replace(/,/g,'-'));fs.mkdirSync(install);
    const dependencies={
      '@mz80/core':`file:${path.join(dependencyDirectory,'mz80-core-0.1.0.tgz').replace(/\\/g,'/')}`,
      '@mz80/assembler':`file:${path.join(dependencyDirectory,'mz80-assembler-0.1.0.tgz').replace(/\\/g,'/')}`,
      '@mz80/c-compiler':`file:${tgz.replace(/\\/g,'/')}`,
    };
    fs.writeFileSync(path.join(install,'package.json'),JSON.stringify({private:true,dependencies,pnpm:{overrides:dependencies}}));
    execFileSync('pnpm',['install','--ignore-scripts'],{cwd:install,stdio:'pipe',shell:process.platform==='win32',timeout:120000});
    fs.copyFileSync(path.join(root,'tools','numeric-pack-probe.cjs'),path.join(install,'probe.cjs'));
    fs.copyFileSync(path.join(root,'docs','examples','numeric-probe.c'),path.join(install,'numeric-probe.c'));
    execFileSync(process.execPath,[path.join(install,'probe.cjs'),modules],{cwd:install,stdio:'inherit',timeout:120000});
    // Rebuild all runtime artifacts from a real source tree that physically
    // contains only the selected numeric modules. No live checkout is moved.
    for(const entry of fs.readdirSync(path.join(root,'dist'))){
      if(entry!=='scc')fs.cpSync(path.join(root,'dist',entry),path.join(fixture,'dist',entry),{recursive:true});
      else for(const child of fs.readdirSync(path.join(root,'dist/scc')))if(child!=='runtime')fs.cpSync(path.join(root,'dist/scc',child),path.join(fixture,'dist/scc',child),{recursive:true});
    }
    fs.mkdirSync(path.join(fixture,'dist/scc/runtime/artifacts'),{recursive:true});
    execFileSync(process.execPath,['-e',"require('./dist/scc/runtimeArtifacts').buildBundledRuntimeArtifacts()"],{
      cwd:fixture,stdio:'pipe',timeout:120000,env:{...process.env,NODE_PATH:path.join(install,'node_modules')},
    });
    for(const feature of ['fixed','bcd'])assert.equal(fs.existsSync(path.join(fixture,'dist/scc/runtime/artifacts',`libmz80-${feature}-v1.lib`)),selected.includes(feature));
    console.log(`[numeric-pack] ${modules}: ${fs.statSync(tgz).size} tarball bytes; clean-install execution passed`);
    fs.unlinkSync(tgz);
    console.log(`[numeric-build] passed ${modules}: assets, prepack and capabilities`);
  }
} finally {
  // The check restores the ordinary development distribution even on failure.
  run(["run", "build"], "fixed,bcd");
  fs.rmSync(temp, { recursive: true, force: true });
}
