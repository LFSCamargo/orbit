/**
 * The IPv4 endpoint inside a Teredo address (2001:0::/32): the last 32 bits
 * are the client address and group 5 the port, both bit-inverted. xCloud may
 * offer only Teredo candidates, so the player adds the plain IPv4 ones too.
 */
export function teredoEndpoint(
  address: string,
): { address: string; port: number } | null {
  const groups = address.split(':')
  if (groups.length !== 8 || groups[0] !== '2001' || Number.parseInt(groups[1], 16) !== 0)
    return null
  const hex = groups[6].padStart(4, '0') + groups[7].padStart(4, '0')
  const bytes = [0, 2, 4, 6].map((i) => ~Number.parseInt(hex.slice(i, i + 2), 16) & 0xff)
  const port = ~Number.parseInt(groups[5], 16) & 0xffff
  if (bytes.some(Number.isNaN) || Number.isNaN(port)) return null
  return { address: bytes.join('.'), port }
}
