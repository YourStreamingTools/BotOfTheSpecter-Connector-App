import React from 'react';
import type { IconProps } from '../icons';

export function Placeholder({ title, icon: Icon, hint }: { title: string; icon: React.FC<IconProps>; hint: string }) {
  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="ambient" style={{ width: 480, height: 480, background: 'var(--primary)', top: -160, right: -120, opacity: 0.18 }} />
      <div style={{ maxWidth: 560, margin: '12vh auto 0', textAlign: 'center', position: 'relative' }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 18px', borderRadius: 16,
          background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
          display: 'grid', placeItems: 'center', boxShadow: '0 0 28px var(--primary-glow)', color: 'white'
        }}>
          <Icon size={30} />
        </div>
        <h2 className="h1" style={{ fontSize: 22 }}>{title}</h2>
        <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{hint}</p>
        <span className="chip" style={{ marginTop: 16 }}>Coming soon</span>
      </div>
    </div>
  );
}
