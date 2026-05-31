import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders nav items across all groups', () => {
    render(<Sidebar expanded active="dashboard" onSelect={vi.fn()} obsState="disconnected" />);
    expect(screen.getByTitle('Dashboard')).toBeInTheDocument();
    expect(screen.getByTitle('OBS Control')).toBeInTheDocument();
    expect(screen.getByTitle('Channel Points')).toBeInTheDocument();
    expect(screen.getByTitle('Variables')).toBeInTheDocument();
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
  });

  it('marks the active item', () => {
    render(<Sidebar expanded active="obs" onSelect={vi.fn()} obsState="connected" />);
    expect(screen.getByTitle('OBS Control')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTitle('Dashboard')).toHaveAttribute('data-active', 'false');
  });

  it('calls onSelect with the screen id when clicked', () => {
    const onSelect = vi.fn();
    render(<Sidebar expanded active="dashboard" onSelect={onSelect} obsState="disconnected" />);
    screen.getByTitle('Logs').click();
    expect(onSelect).toHaveBeenCalledWith('logs');
  });

  it('shows "Not signed in" when there is no account', () => {
    render(<Sidebar expanded active="dashboard" onSelect={vi.fn()} obsState="disconnected" />);
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
  });

  it('shows the signed-in account in the footer', () => {
    render(<Sidebar expanded active="dashboard" onSelect={vi.fn()} obsState="connected"
      account={{ id: 2, username: 'teststreamer', displayName: 'TestStreamer', twitchUserId: '1234567',
                 isAdmin: false, betaAccess: false, isTechnical: false }} />);
    expect(screen.getByText('TestStreamer')).toBeInTheDocument();
    expect(screen.getByText('@teststreamer')).toBeInTheDocument();
    expect(screen.queryByText('Not signed in')).not.toBeInTheDocument();
  });
});
