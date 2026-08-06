export async function GET() {
  return new Response(
    JSON.stringify({
      applinks: {
        apps: [],
        details: [{ appID: '5U6J5AR2B4.com.pulsefc.mobile', paths: ['*'] }],
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
