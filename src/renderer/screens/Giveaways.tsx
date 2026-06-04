import React from 'react';
import { ScreenRaffles } from './Raffles';
import { ScreenPolls } from './Polls';
import { IconGiveaway, IconBolt } from '../icons';

type Tab = 'giveaways' | 'polls';

/**
 * Host screen for the Engagement → Giveaways nav slot. Tabs across the giveaway-style
 * features: Giveaways (raffles) and Polls (Twitch). A Predictions tab can be added here
 * later. Each child renders a plain root; this container owns the `.screen` wrapper.
 */
export function ScreenGiveaways() {
  const [tab, setTab] = React.useState<Tab>('giveaways');
  return (
    <div className="screen">
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <button className={`btn btn-sm ${tab === 'giveaways' ? 'btn-primary' : ''}`} onClick={() => setTab('giveaways')}>
          <IconGiveaway size={12} />Giveaways
        </button>
        <button className={`btn btn-sm ${tab === 'polls' ? 'btn-primary' : ''}`} onClick={() => setTab('polls')}>
          <IconBolt size={12} />Polls
        </button>
      </div>
      {tab === 'giveaways' ? <ScreenRaffles /> : <ScreenPolls />}
    </div>
  );
}
