import { md5 } from "./md5";

describe("md5", () => {
  it("matches RFC 1321's test suite", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("a")).toBe("0cc175b9c0f1b6a831c399e269772661");
    expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
    expect(md5("abcdefghijklmnopqrstuvwxyz")).toBe("c3fcd3d76192e4007dfb496cca67e13b");
    expect(md5("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")).toBe(
      "d174ab98d277d9f5a5611c2c9f419d9f",
    );
    expect(md5("1234567890".repeat(8))).toBe("57edf4a22be3c955ac49da2e2107b67a");
  });

  it("hashes UTF-8 as PHP's md5() does", () => {
    expect(md5("ä")).toBe("8419b71c87a225a2c70b50486fbee545");
  });
});
