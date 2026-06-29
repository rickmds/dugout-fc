const SEND_INVITE_ENDPOINT = `${process.env.NEXT_PUBLIC_APP_URL}/api/send-invite`;

export interface InviteEmailPayload {
  to: string;
  teamName: string;
  clubName: string;
  inviteToken: string;
  playerName: string;
}

export async function sendInviteEmail(payload: InviteEmailPayload): Promise<void> {
  const res = await fetch(SEND_INVITE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send invite email (${res.status}): ${text}`);
  }
}
