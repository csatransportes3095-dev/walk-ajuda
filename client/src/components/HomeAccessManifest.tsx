import { ReferralAccessManifest } from './ReferralAccessManifest';

export function HomeAccessManifest({ onGranted }: { onGranted: () => void }) {
  return (
    <ReferralAccessManifest
      onGranted={({ phone, referralPhone }) => {
        if (referralPhone) {
          sessionStorage.setItem('walk_home_referral_phone', referralPhone);
          sessionStorage.setItem('walk_home_new_phone', phone);
        } else {
          sessionStorage.setItem('walk_home_existing_phone', phone);
        }
        onGranted();
      }}
    />
  );
}
