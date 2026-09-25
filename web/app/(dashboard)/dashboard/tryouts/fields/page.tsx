'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Fields used to have two separate editors — this one (tryouts-only) and
// /dashboard/fields (the main one, with closures, availability rules, and
// weather) — both writing to the same tryout_fields table with disjoint
// column sets. Folded into one: the main Fields page now has everything
// this page used to (field size, dimensions, facilities, facility
// contact), so this just forwards there instead of staying a second,
// incomplete place to manage the same records.
export default function TryoutFieldsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/fields'); }, [router]);
  return null;
}
