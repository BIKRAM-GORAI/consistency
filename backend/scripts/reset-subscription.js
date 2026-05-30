/**
 * reset-subscription.js
 * ---------------------
 * Resets the subscription of a given email address back to the free tier.
 * Run with:  node backend/scripts/reset-subscription.js <email>
 *
 * Example:   node backend/scripts/reset-subscription.js bikram77620@gmail.com
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const email = process.argv[2];

if (!email) {
  console.error('\n❌  Usage: node backend/scripts/reset-subscription.js <email>\n');
  process.exit(1);
}

async function resetSubscription() {
  try {
    console.log(`\n🔗  Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅  Connected.\n`);

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.error(`❌  No user found with email: ${email}`);
      process.exit(1);
    }

    console.log(`👤  Found user:`);
    console.log(`    Name            : ${user.name}`);
    console.log(`    Email           : ${user.email}`);
    console.log(`    Current Tier    : ${user.subscriptionTier}`);
    console.log(`    Expires At      : ${user.subscriptionExpiresAt || 'N/A'}`);
    console.log(`    Subscription ID : ${user.subscriptionId || 'N/A'}`);
    console.log(`    Payment ID      : ${user.razorpayPaymentId || 'N/A'}`);
    console.log(`    Pending Order   : ${user.pendingSubscriptionId || 'N/A'}`);
    console.log('');

    // Reset all subscription-related fields to free-tier defaults
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          subscriptionTier: 'free',
          subscriptionExpiresAt: null,
          subscriptionId: null,
          razorpayPaymentId: null,
          pendingSubscriptionId: null,
          pendingSubscriptionDuration: null,
        }
      }
    );

    console.log(`🎉  Subscription reset successfully!`);
    console.log(`    subscriptionTier          → free`);
    console.log(`    subscriptionExpiresAt     → null`);
    console.log(`    subscriptionId            → null`);
    console.log(`    razorpayPaymentId         → null`);
    console.log(`    pendingSubscriptionId     → null`);
    console.log(`    pendingSubscriptionDuration → null`);
    console.log(`\n✅  Done. You can now test the full subscription flow fresh.\n`);

  } catch (err) {
    console.error('❌  Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

resetSubscription();
