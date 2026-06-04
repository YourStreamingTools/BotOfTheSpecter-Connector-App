import React from 'react';
import { ScreenRaffles } from './Raffles';
import { ScreenPolls } from './Polls';
import { ScreenPredictions } from './Predictions';
import { IconGiveaway, IconBolt, IconStar } from '../icons';

type Tab = 'giveaways' | 'polls' | 'predictions';

/** Host screen for the Giveaways nav slot; tabs across Giveaways (raffles), Polls and Predictions, and owns the `.screen` wrapper. */
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
        <button className={`btn btn-sm ${tab === 'predictions' ? 'btn-primary' : ''}`} onClick={() => setTab('predictions')}>
          <IconStar size={12} />Predictions
        </button>
      </div>
      {tab === 'giveaways' ? <ScreenRaffles /> : tab === 'polls' ? <ScreenPolls /> : <ScreenPredictions />}
    </div>
  );
}
