import { Account, MuxedAccount, StrKey } from "@stellar/stellar-sdk";

// A muxed account (an `M...` address) is a base Stellar account plus a 64-bit
// id, encoded together. Zenith gives each invoice its own muxed address derived
// from the merchant's account and the invoice's numeric id. The customer pays
// the muxed address; the funds arrive in the merchant account and the id rides
// along in the transaction, so the watcher can tell which invoice was paid.
// This is why Zenith never needs custody: there is no pooled account, only the
// merchant's own account addressed one extra way.

const U64_MAX = 18446744073709551615n;

export function isValidMerchantAccount(publicKey: string): boolean {
  return StrKey.isValidEd25519PublicKey(publicKey);
}

export function deriveMuxedAddress(merchantAccount: string, invoiceId: bigint): string {
  if (!isValidMerchantAccount(merchantAccount)) {
    throw new Error(`Not a valid ed25519 public key: ${merchantAccount}`);
  }
  if (invoiceId < 0n || invoiceId > U64_MAX) {
    throw new Error(`Invoice id out of 64-bit range: ${invoiceId}`);
  }
  // Sequence is irrelevant to address encoding; MuxedAccount requires an Account.
  const base = new Account(merchantAccount, "0");
  const muxed = new MuxedAccount(base, invoiceId.toString());
  return muxed.accountId();
}

export interface ParsedMuxed {
  merchantAccount: string;
  invoiceId: bigint;
}

export function parseMuxedAddress(muxedAddress: string): ParsedMuxed {
  if (!StrKey.isValidMed25519PublicKey(muxedAddress)) {
    throw new Error(`Not a valid muxed address: ${muxedAddress}`);
  }
  const muxed = MuxedAccount.fromAddress(muxedAddress, "0");
  return {
    merchantAccount: muxed.baseAccount().accountId(),
    invoiceId: BigInt(muxed.id()),
  };
}
