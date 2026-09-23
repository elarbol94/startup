import { expect, it } from "vitest";
import { privateAddress } from "./public-fetch";

it("classifies non-public addresses, including IPv6-mapped and CGNAT forms", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fd00::1", "fe80::1"]) {
    expect(privateAddress(address), address).toBe(true);
  }
  for (const address of ["1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    expect(privateAddress(address), address).toBe(false);
  }
});
