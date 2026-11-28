/**
 * In-Memory Prefix Tree (Trie) for instant O(L) username autocomplete.
 * Warm-cached on serverless instances with a 5-minute TTL.
 */
class TrieNode {
  constructor() {
    this.children = Object.create(null);
    this.user = null;
  }
}

class UsernameTrie {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.root = new TrieNode();
    this.ttlMs = ttlMs;
    this.lastLoadedAt = 0;
    this.loadingPromise = null;
  }

  isFresh() {
    return this.lastLoadedAt > 0 && (Date.now() - this.lastLoadedAt) < this.ttlMs;
  }

  invalidate() {
    this.lastLoadedAt = 0;
  }

  insert(key, userObj) {
    if (!key) return;
    let node = this.root;
    for (let i = 0; i < key.length; i++) {
      const ch = key[i];
      if (!node.children[ch]) {
        node.children[ch] = new TrieNode();
      }
      node = node.children[ch];
    }
    node.user = userObj;
  }

  async ensureLoaded(UserModel) {
    if (this.isFresh()) return;
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = (async () => {
      try {
        const users = await UserModel.find({
          username: { $exists: true, $ne: null },
          isBlacklisted: { $ne: true }
        })
          .select('username name profilePicture currentStreak highestStreak subscriptionTier subscriptionExpiresAt')
          .lean();

        const nextRoot = new TrieNode();
        const oldRoot = this.root;
        this.root = nextRoot;

        const now = Date.now();
        for (const u of users) {
          if (!u.username) continue;
          const isPremium = u.subscriptionTier === 'premium' &&
            (!u.subscriptionExpiresAt || new Date(u.subscriptionExpiresAt).getTime() > now);
          this.insert(u.username.toLowerCase(), {
            _id: u._id,
            username: u.username,
            profilePicture: u.profilePicture || '',
            currentStreak: u.currentStreak || 0,
            highestStreak: u.highestStreak || 0,
            isPremium
          });
        }

        this.lastLoadedAt = Date.now();
      } catch (err) {
        // Keep previous tree if refresh fails
        console.error('[UsernameTrie] Failed to load users:', err.message);
      } finally {
        this.loadingPromise = null;
      }
    })();

    await this.loadingPromise;
  }

  searchPrefix(prefix, limit = 10) {
    const q = String(prefix || '').toLowerCase().trim();
    if (!q) return [];

    let node = this.root;
    for (let i = 0; i < q.length; i++) {
      const ch = q[i];
      if (!node.children[ch]) {
        return [];
      }
      node = node.children[ch];
    }

    const results = [];
    const stack = [node];
    while (stack.length > 0 && results.length < limit) {
      const curr = stack.pop();
      if (curr.user) {
        results.push(curr.user);
        if (results.length >= limit) break;
      }
      const keys = Object.keys(curr.children);
      for (let i = keys.length - 1; i >= 0; i--) {
        stack.push(curr.children[keys[i]]);
      }
    }
    return results;
  }
}

module.exports = new UsernameTrie();
