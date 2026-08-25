# TsSccCompiler Binary ABI and Stack Frame

更新日: 2026-08-22

## Status and Scope

この文書は `TsSccCompilerAdapter` が出力する current C Subset ABI の実装仕様である。対象は TypeScript source path の `.scc.asm` emitter である。

既定 compatibility profile は **Small-C** とする。これは `.scc.asm` syntax、bundled runtime、C call boundary を Small-C 系へ寄せる方針を表す。historic Small-C/SCC implementation と binary ABI の全細部が一致することは、external object/assembler interoperability test で個別に証明されるまで `P` とする。

**SDCC `__sdcccall(0)`** は将来の追加 compatibility profile 候補であり、既定 ABI ではない。stack-only、caller cleanup、16-bit `HL` return は近いが、8-bit return、argument layout、hidden aggregate-return slot を独立に検証する必要がある。

現時点では register preservation、signedness、alignment の一部は未確定である。未確定項目は ABI 契約として利用してはならない。

## Data Layout

| value | size | representation |
| --- | --- | --- |
| `char` | 1 byte | byte |
| `int` | 2 bytes | little-endian word |
| scalar/aggregate/function pointer | 2 bytes | little-endian address |
| struct/union | semantic size bytes | byte-packed current layout |

- aggregate copy は semantic field offset を使う byte copy である。
- current layout に padding/alignment rule はない。Z80 の byte addressability を前提とし、`sizeof` と field offset は semantic layout の値を使う。
- `char` pointer arithmetic は stride 1、`int` は stride 2、`T (*)[N]` は `N * sizeof(T)` を row stride とする。

## Stack Frame

frame pointer register は使わない。`IX` / `IY` は保存・frame access に利用せず、local/argument address は都度 `HL = SP + offset` で求める。

```text
lower address
SP + 0                 local slot 0 / first reserved byte
...                    user local slots
...                    compiler temporary aggregate slots
SP + localBytes        return address, low byte
SP + localBytes + 1    return address, high byte
SP + localBytes + 2    nearest argument slot
...                    remaining argument slots
higher address
```

- function entry で `localBytes` 回 `dec sp` し、全 return path で同じ回数 `inc sp` してから `ret` する。
- user locals を先に並べ、aggregate producer/return 用 temporary slot をその後ろに追加する。
- local offset は frame bottom (`SP + 0`) 基準、argument offset は `localBytes + 2 + trailingArgumentBytes` 基準で計算する。
- expression evaluation 中の `push` により `SP` が動くため、emitter は `stackDelta` を offset に加算して local/argument address を補正する。

## Calls and Returns

| operation | contract |
| --- | --- |
| scalar/pointer argument | caller pushes ABI-width value; caller cleans pushed bytes after return |
| aggregate argument | caller materializes source to storage and passes its 2-byte address |
| scalar/pointer return | callee returns value in `HL` |
| aggregate return | caller allocates destination and passes its address as hidden argument slot 0; callee byte-copies to it and performs normal return |
| argument cleanup | caller pops every pushed argument, including aggregate hidden destination address |

For aggregate-returning functions, user parameter slot `n` is lowered as ABI slot `n + 1`; slot 0 is the hidden destination pointer.

## Compatibility Profiles

| profile | role | current status | compatibility boundary |
| --- | --- | --- | --- |
| `smallc` | default target profile | P | current `.scc.asm` and bundled runtime pass; historic Small-C external object ABI needs proof |
| `sdcccall0` | future optional profile | N | requires distinct return/register/argument lowering and interop tests |
| `sdcccall1` | not planned as default | N | register argument passing and different return registers conflict with the default profile |
| `msxc-nonrec` | not planned as default | N | register-first, non-recursive calling convention |
| `hitech-compiled` | research target | N | requires compiled auto/parameter blocks and linker overlay, not just call lowering |

Small-C proof obligations are: 8/16-bit return register, argument push order and byte widening, caller/callee cleanup, pointer/function-pointer call, and aggregate convention where the selected Small-C implementation supports it.

## Register Contract

| register | current use | contractual status |
| --- | --- | --- |
| `HL` | expression result, address calculation, scalar/pointer return | defined for return; temporary use otherwise |
| `DE`, `BC`, `AF` | emitter/helper temporaries | clobber contract not yet formalized |
| `IX`, `IY` | not used as frame pointer by current emitter | preservation not specified |
| `SP` | frame base and evaluation stack | must be balanced at every return/call boundary |

## Verification Matrix

| ABI feature | code authority | runtime evidence | status |
| --- | --- | --- | --- |
| SP-relative local byte/word access | `emitLoadStackAddrToHl()` | local char/int adapter tests | S |
| positive-offset argument access | `layoutFunction()` | one/two argument runtime tests | S |
| caller argument cleanup | call emitter | nested and multi-argument runtime tests | S |
| scalar/pointer `HL` return | return emitter | scalar/pointer return runtime tests | S |
| aggregate hidden return slot | lowering `paramSlotBase = 1` | struct/union aggregate return tests | S |
| aggregate temporary slots | lowering allocation + frame layout | aggregate call/field consumer runtime tests | S |
| Small-C external assembler/object interoperability | compatibility profile | no direct external object test | P |
| SDCC `__sdcccall(0)` interoperability | compatibility profile | no implementation/test | N |
| byte-packed aggregate layout | semantic layout + emitter | aggregate field/initializer tests | P |
| register preserved/clobbered set | none | no direct contract test | N |
| stack alignment | none required/defined | Z80 byte-addressable stack only | N |

## Non-Goals

- This is not an ABI stability promise for external object modules yet.
- Varargs, floating point, non-current scalar widths, and recursive array ABI are outside the current contract.
- Future 2-D arrays must preserve this frame model; only element size and row stride should change.
