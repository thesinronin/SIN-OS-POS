export function formatIpWithPort(ip: string, defaultPort = 3000): string {
  const clean = ip.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!clean || clean.includes('Detecting')) return clean;
  if (clean.includes(':')) return clean;
  return `${clean}:${defaultPort}`;
}

export async function detectDeviceWifiIp(): Promise<string> {
  let detected = '';

  // 1. Try server endpoint first if connected
  try {
    const res = await fetch('/api/info');
    if (res.ok) {
      const data = (await res.json()) as { primaryIp?: string; wifiIps?: string[]; port?: number };
      const port = data.port || 3000;
      if (data.primaryIp && data.primaryIp !== 'localhost' && data.primaryIp !== '127.0.0.1') {
        return formatIpWithPort(data.primaryIp, port);
      }
      if (data.wifiIps && data.wifiIps.length > 0) {
        return formatIpWithPort(data.wifiIps[0], port);
      }
    }
  } catch {
    // Ignore fetch error
  }

  // 2. WebRTC local IPv4 ICE candidate resolution
  detected = await new Promise<string>((resolve) => {
    let resolved = false;
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('ip-check');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {});

      pc.onicecandidate = (event) => {
        if (resolved || !event || !event.candidate) return;
        const cand = event.candidate.candidate;
        const match = /([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/.exec(cand);
        if (match && match[1] && !match[1].startsWith('127.')) {
          resolved = true;
          try {
            pc.close();
          } catch {
            // Ignore
          }
          resolve(match[1]);
        }
      };

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            pc.close();
          } catch {
            // Ignore
          }
          const host = window.location.hostname;
          resolve(host && host !== 'localhost' ? host : '');
        }
      }, 1000);
    } catch {
      const host = window.location.hostname;
      resolve(host && host !== 'localhost' ? host : '');
    }
  });

  if (detected) {
    return formatIpWithPort(detected, 3000);
  }

  return '192.168.1.100:3000';
}
