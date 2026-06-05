import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenChannelPoints } from './ChannelPoints';
import type { ChannelReward, ChannelPointsSnapshot, RedemptionItem, RewardGroup } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const reward = (over: Partial<ChannelReward> = {}): ChannelReward => ({
  id: 'a', title: 'Hydrate', cost: 100, prompt: '', isEnabled: true, isPaused: false, isInStock: true,
  isUserInputRequired: false, globalCooldownEnabled: false, globalCooldownSeconds: 0,
  maxPerStreamEnabled: false, maxPerStream: 0, maxPerUserPerStreamEnabled: false, maxPerUserPerStream: 0,
  manageable: true, ...over
});

const setSnapshot = (snap: ChannelPointsSnapshot) => {
  window.api.channelPoints = {
    snapshot: vi.fn().mockResolvedValue(snap),
    refresh: vi.fn().mockResolvedValue(undefined),
    createReward: vi.fn().mockResolvedValue(true),
    importReward: vi.fn().mockResolvedValue(true),
    updateReward: vi.fn().mockResolvedValue(true),
    listRedemptions: vi.fn().mockResolvedValue([]),
    setRedemption: vi.fn().mockResolvedValue(true)
  };
};

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ rewards: [], state: 'idle' });
});

describe('ScreenChannelPoints', () => {
  it('prompts for an API key when idle', async () => {
    render(<ScreenChannelPoints />);
    expect(await screen.findByText(/No API key yet/i)).toBeInTheDocument();
  });

  it('renders reward cards with cost', async () => {
    setSnapshot({ state: 'ok', rewards: [reward({ title: 'Hydrate', cost: 1500 })] });
    render(<ScreenChannelPoints />);
    expect(await screen.findByText('Hydrate')).toBeInTheDocument();
    expect(screen.getByText('1,500 pts')).toBeInTheDocument();
  });

  it('shows edit/toggle controls for manageable rewards and a website link for others', async () => {
    setSnapshot({ state: 'ok', rewards: [
      reward({ id: 'a', title: 'Mine', manageable: true }),
      reward({ id: 'b', title: 'Theirs', manageable: false })
    ] });
    render(<ScreenChannelPoints />);
    await screen.findByText('Mine');
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage on the website/i })).toBeInTheDocument();
  });

  it('imports a non-manageable reward and shows the manual follow-up steps', async () => {
    setSnapshot({ state: 'ok', rewards: [reward({ id: 'b', title: 'Theirs', manageable: false })] });
    render(<ScreenChannelPoints />);
    await screen.findByText('Theirs');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /import to specter/i })); });
    expect(window.api.channelPoints.importReward).toHaveBeenCalledWith('b');
    // Follow-up modal tells the user to delete the original + re-upload the image on Twitch.
    expect(await screen.findByText(/delete the original/i)).toBeInTheDocument();
    expect(screen.getByText(/upload the reward image/i)).toBeInTheDocument();
  });

  it('toggles enabled on a manageable reward', async () => {
    setSnapshot({ state: 'ok', rewards: [reward({ id: 'a', isEnabled: true })] });
    render(<ScreenChannelPoints />);
    await screen.findByText('Hydrate');
    fireEvent.click(screen.getAllByText('Enabled')[0].querySelector('.toggle')!);
    expect(window.api.channelPoints.updateReward).toHaveBeenCalledWith('a', { isEnabled: false });
  });

  it('edits a reward through the modal', async () => {
    setSnapshot({ state: 'ok', rewards: [reward({ id: 'a' })] });
    render(<ScreenChannelPoints />);
    await screen.findByText('Hydrate');
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '250' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^save$/i })); });
    expect(window.api.channelPoints.updateReward).toHaveBeenCalledWith('a', expect.objectContaining({ cost: 250, title: 'Hydrate' }));
  });

  it('lists pending redemptions and fulfills one', async () => {
    const redemption: RedemptionItem = { id: 'rd1', rewardId: 'a', rewardTitle: 'Hydrate', rewardCost: 100, userName: 'owl', userInput: 'go', redeemedAt: '', status: 'UNFULFILLED' };
    setSnapshot({ state: 'ok', rewards: [reward({ id: 'a' })] });
    window.api.channelPoints.listRedemptions = vi.fn().mockResolvedValue([redemption]);
    render(<ScreenChannelPoints />);
    await screen.findByText('Hydrate');
    fireEvent.click(screen.getByRole('button', { name: /view pending redemptions/i }));
    expect(await screen.findByText(/owl: go/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^fulfill$/i }));
    expect(window.api.channelPoints.setRedemption).toHaveBeenCalledWith('a', 'rd1', 'FULFILLED');
  });

  it('creates a reward via the New Redemption modal', async () => {
    setSnapshot({ state: 'ok', rewards: [] });
    render(<ScreenChannelPoints />);
    await screen.findByRole('button', { name: /new redemption/i });
    fireEvent.click(screen.getByRole('button', { name: /new redemption/i }));
    fireEvent.change(screen.getByPlaceholderText(/reward title/i), { target: { value: 'Big Reward' } });
    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '500' } });     // cost
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create$/i })); });
    expect(window.api.channelPoints.createReward).toHaveBeenCalledWith(expect.objectContaining({ title: 'Big Reward', cost: 500 }));
  });

  it('updates live from a channelPoints:changed push', async () => {
    render(<ScreenChannelPoints />);
    await screen.findByText(/No API key yet/i);
    act(() => listeners['channelPoints:changed']({ state: 'ok', rewards: [reward({ title: 'Pushed' })] } as ChannelPointsSnapshot));
    expect(await screen.findByText('Pushed')).toBeInTheDocument();
  });

  it('creates a group via the New Group modal', async () => {
    setSnapshot({ state: 'ok', rewards: [reward({ id: 'a', title: 'Cam' })] });
    render(<ScreenChannelPoints />);
    await screen.findByText('Cam');
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    fireEvent.change(screen.getByPlaceholderText(/group name/i), { target: { value: 'Sounds' } });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create$/i })); });
    expect(window.api.rewardGroups.create).toHaveBeenCalledWith({ name: 'Sounds', rewardIds: ['a'] });
  });

  it('toggles a group on/off from its chip', async () => {
    const group: RewardGroup = { id: 'grp_1', name: 'Sounds', rewardIds: ['a', 'b'] };
    window.api.rewardGroups.list = vi.fn().mockResolvedValue([group]);
    setSnapshot({ state: 'ok', rewards: [reward({ id: 'a' })] });
    render(<ScreenChannelPoints />);
    await screen.findByText('Sounds');
    fireEvent.click(screen.getByRole('button', { name: /^off$/i }));
    expect(window.api.rewardGroups.setEnabled).toHaveBeenCalledWith('grp_1', false);
    fireEvent.click(screen.getByRole('button', { name: /^on$/i }));
    expect(window.api.rewardGroups.setEnabled).toHaveBeenCalledWith('grp_1', true);
  });
});
