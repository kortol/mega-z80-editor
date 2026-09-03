export type Fixture = {
    name: string;
    source: string;
    virtualFiles?: Record<string, string>;
};
export declare const fixtures: Fixture[];
