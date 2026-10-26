import { describe, it, expect } from 'vitest';
import type { NetworkInterfaceInfo } from 'os';
import { lanIpv4s } from './camera-service';

const v4 = (address: string): NetworkInterfaceInfo => ({
  address, family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24`
});

describe('lanIpv4s', () => {
  it('puts the Wi-Fi adapter ahead of a 192.168 virtual adapter (macOS bridge/VM)', () => {
    expect(lanIpv4s({
      bridge100: [v4('192.168.64.1')],
      en0: [v4('10.177.185.7')],
      utun3: [v4('10.8.0.2')]
    })).toEqual(['10.177.185.7', '192.168.64.1', '10.8.0.2']);
  });

  it('puts Windows Wi-Fi ahead of Hyper-V and VirtualBox adapters', () => {
    expect(lanIpv4s({
      'vEthernet (WSL)': [v4('172.20.0.1')],
      'VirtualBox Host-Only Network': [v4('192.168.56.1')],
      'Wi-Fi': [v4('192.168.1.20')]
    })).toEqual(['192.168.1.20', '192.168.56.1', '172.20.0.1']);
  });

  it('keeps home-router ranges first among real adapters and skips public and loopback addresses', () => {
    expect(lanIpv4s({
      en1: [v4('10.0.0.5')],
      en0: [v4('192.168.0.8'), v4('8.8.8.8')],
      lo0: [{ ...v4('127.0.0.1'), internal: true }]
    })).toEqual(['192.168.0.8', '10.0.0.5']);
  });
});
