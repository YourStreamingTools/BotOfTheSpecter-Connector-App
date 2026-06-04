import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScreenGiveaways } from './Giveaways';

beforeEach(() => {
  window.api.on = vi.fn(() => () => {});
});

describe('ScreenGiveaways', () => {
  it('shows Giveaways and Polls tabs and switches between them', async () => {
    render(<ScreenGiveaways />);
    // Default tab is Giveaways — the raffle screen's "New giveaway" button is present.
    expect(await screen.findByRole('button', { name: /new giveaway/i })).toBeInTheDocument();
    // Switch to the Polls tab.
    fireEvent.click(screen.getByRole('button', { name: /^polls$/i }));
    expect(await screen.findByRole('button', { name: /new poll/i })).toBeInTheDocument();
  });
});
