declare module 'multiformats/cid' {
  export const CID: {
    parse(input: string): {
      multihash: {
        code: number;
        size: number;
        digest: Uint8Array;
      };
    };
  };
}
