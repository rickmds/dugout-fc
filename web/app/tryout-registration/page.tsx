import { redirect } from 'next/navigation';

// Superseded by the shorter /t/[clubSlug] route, kept alive so any link
// already printed on a flyer, sent in an email, or saved in a text
// thread before this redirect existed keeps working rather than 404ing.
export default async function LegacyTryoutRegistrationRedirect({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const { club } = await searchParams;
  if (club) redirect(`/t/${club}`);
  redirect('/');
}
