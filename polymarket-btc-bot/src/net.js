// Some dev/consumer networks hit an ISP-level DNS hijack on Polymarket's
// domains (this exact machine did, per Lyra's own server.js). If
// DEV_DNS_OVERRIDE is set, route just this process's fetch() lookups
// through that resolver instead of the OS one, same fix used there.
import dns from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

export function applyDevDnsOverride() {
  if (!process.env.DEV_DNS_OVERRIDE) return;
  const resolver = new dns.promises.Resolver();
  resolver.setServers([process.env.DEV_DNS_OVERRIDE]);

  setGlobalDispatcher(new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        resolver.resolve4(hostname).then(
          (addresses) => {
            if (options.all) callback(null, addresses.map(address => ({ address, family: 4 })));
            else callback(null, addresses[0], 4);
          },
          (err) => callback(err)
        );
      },
    },
  }));
  console.log(`[net] Using ${process.env.DEV_DNS_OVERRIDE} for Polymarket lookups (DEV_DNS_OVERRIDE).`);
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), ...options });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // leave data null, caller decides how to handle a non-JSON body
  }
  return { ok: response.ok, status: response.status, data, rawText: text };
}
