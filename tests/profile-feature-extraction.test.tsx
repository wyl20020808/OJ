// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '../apps/web/src/features/profile/ProfilePage.js';
import type { ApiClient, PublicProfile } from '../apps/web/src/services/api.js';

afterEach(cleanup);

describe('Profile feature extraction', () => {
  it('keeps public-profile API, avatar, background, and navigation behavior', async () => {
    const profile: PublicProfile = {
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: 'https://example.test/avatar.png',
      backgroundUrl: 'https://example.test/background.png',
      createdAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        contractVersion: 1,
        activity: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
        favorites: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
      },
    };
    const api = {
      publicProfile: vi.fn().mockResolvedValue(profile),
      profileOverview: vi.fn().mockResolvedValue({
        createdProblemCount: 0,
        solvedProblemCount: 0,
        submissionCount: 0,
        acceptedSubmissionCount: 0,
      }),
    } as unknown as ApiClient;
    const navigate = vi.fn();

    render(<ProfilePage user={null} username="alice" api={api} navigate={navigate} />);

    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeTruthy();
    expect(api.publicProfile).toHaveBeenCalledWith('alice');
    expect(document.querySelector('img[alt="头像"]')?.getAttribute('src')).toBe(
      profile.avatarUrl,
    );
    expect(
      document.querySelector('img[alt="个人主页背景"]')?.getAttribute('src'),
    ).toBe(profile.backgroundUrl);
    expect(navigate).not.toHaveBeenCalled();
  });
});
