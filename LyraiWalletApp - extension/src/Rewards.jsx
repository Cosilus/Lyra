import { Gift } from "lucide-react";

// "Rewards" tab: what the airdrop is about. Text only for now, nothing to claim yet.
export function RewardsPanel() {
  return (
    <div className="rewards">
      <div className="rewards-gift" aria-hidden="true">
        <Gift size={30} strokeWidth={1.7} />
      </div>
      <div className="rewards-headline">Every interaction counts</div>
      <p className="rewards-text">Each interaction you have with Lyra is recorded.</p>

      <div className="rewards-card">
        <span className="rewards-badge">Coming soon</span>
        <div className="rewards-card-title">Community Airdrop</div>
        <p>A new type of airdrop will take place: the <strong>Community Airdrop</strong>.</p>
      </div>

      <p className="rewards-note">Details and eligibility will be announced. Nothing here is a promise of any reward.</p>
    </div>
  );
}
