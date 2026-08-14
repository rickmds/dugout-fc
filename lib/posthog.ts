import PostHog from 'posthog-react-native';

export const posthog = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_KEY!, {
  host: 'https://app.posthog.com',
  disabled: process.env.EXPO_PUBLIC_APP_ENV === 'development',
});
