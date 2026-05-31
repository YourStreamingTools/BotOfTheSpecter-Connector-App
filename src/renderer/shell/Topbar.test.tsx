import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Topbar } from './Topbar';

describe('Topbar OBS status pill', () => {
  it('is keyboard-operable (focusable + activates on Enter/Space)', () => {
    const onClick = vi.fn();
    render(<Topbar screen="dashboard" obsState="connected" streamLive={false} onObsPillClick={onClick} />);
    const pill = screen.getByRole('button');
    expect(pill).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(pill, { key: 'Enter' });
    fireEvent.keyDown(pill, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
