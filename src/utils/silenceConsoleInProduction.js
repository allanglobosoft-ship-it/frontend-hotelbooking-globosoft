// The production build used to print booking payloads, prices, tokens and
// guest details through ~900 console.log calls, readable by anyone with the
// browser console open (S:SEC-16). In production, log / info / debug do
// nothing; warn and error stay so real problems are still visible (and the
// activity logger still reports JS errors). Development is unchanged.
if (process.env.NODE_ENV === "production") {
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
}
