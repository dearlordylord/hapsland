import "reflect-metadata"
import { randomBytes } from "node:crypto"
import {
  X509CertificateGenerator,
  SubjectAlternativeNameExtension,
  BasicConstraintsExtension,
  KeyUsagesExtension,
  KeyUsageFlags,
  ExtendedKeyUsageExtension
} from "@peculiar/x509"

/** A fresh, in-memory key per resident. Only the certificate is advertised. */
export const generateResidentIdentity = async () => {
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const certificate = await X509CertificateGenerator.createSelfSigned(
    {
      serialNumber: randomBytes(16).toString("hex"),
      name: "CN=Hapsland resident",
      notBefore: new Date(now - 60_000),
      notAfter: new Date(now + 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: algorithm,
      keys,
      extensions: [
        new BasicConstraintsExtension(true, 0, true),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.keyCertSign, true),
        new ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1"], true),
        new SubjectAlternativeNameExtension([{ type: "ip", value: "127.0.0.1" }])
      ]
    },
    crypto
  )
  const key = await crypto.subtle.exportKey("pkcs8", keys.privateKey)
  return {
    certificate: certificate.toString("pem"),
    privateKey: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(key)
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n")}\n-----END PRIVATE KEY-----\n`
  }
}
