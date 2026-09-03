import { RelModule } from "./core/types";
export type ArchiveMember = {
    name: string;
    module: RelModule;
};
export type ArchiveModule = {
    path: string;
    members: ArchiveMember[];
};
export declare function createArchive(inputFiles: string[], outputFile: string): void;
export declare function isArchivePath(filePath: string): boolean;
export declare function loadArchiveFile(filePath: string): ArchiveModule;
