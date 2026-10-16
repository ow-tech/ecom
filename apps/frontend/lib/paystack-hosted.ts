export function redirectToPaystackHostedCheckout(authorizationUrl: string) {
  const target = new URL(authorizationUrl);
  if (target.protocol !== "https:") throw new Error("Paystack returned an invalid secure checkout URL.");
  window.location.assign(target.toString());
}
