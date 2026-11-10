import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@/lib/api';
import { classifySignInError } from '@/features/signInErrors';
import { RequestAccessSheet } from '@/features/RequestAccess';

jest.mock('@react-native-google-signin/google-signin', () => ({
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' },
}));
const mockApi = jest.fn();
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: (...a: unknown[]) => mockApi(...a) }));

describe('classifySignInError', () => {
  test('server says google_access_denied → request access', () => {
    expect(classifySignInError(new ApiError(403, 'blocked', { code: 'google_access_denied' }))).toMatchObject({ kind: 'denied' });
  });
  test('Google SDK refusal codes → request access', () => {
    expect(classifySignInError(Object.assign(new Error('Unauthorized'), { code: '12500' }))).toMatchObject({ kind: 'denied' });
    expect(classifySignInError(Object.assign(new Error('DEVELOPER_ERROR'), { code: '10' }))).toMatchObject({ kind: 'denied' });
  });
  test('cancel and network are not access problems', () => {
    expect(classifySignInError(Object.assign(new Error('x'), { code: 'SIGN_IN_CANCELLED' }))).toEqual({ kind: 'cancelled' });
    expect(classifySignInError(new TypeError('Network request failed'))).toMatchObject({ kind: 'error' });
    expect(classifySignInError(new ApiError(500, 'boom'))).toEqual({ kind: 'error', message: 'boom' });
  });
});

describe('<RequestAccessSheet />', () => {
  test('validates the email, sends it, and confirms', async () => {
    mockApi.mockResolvedValue({ ok: true });
    await render(<RequestAccessSheet visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText('Send request'));
    expect(screen.getByText('Enter the Gmail address you sign in with.')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('request-email'), ' Kim@Gmail.com ');
    await fireEvent.press(screen.getByText('Send request'));
    await waitFor(() => expect(screen.getByText(/We’ll email kim@gmail.com/)).toBeTruthy());
    expect(mockApi).toHaveBeenCalledWith('/access-requests', { auth: false, body: { email: 'kim@gmail.com' } });
  });
});
