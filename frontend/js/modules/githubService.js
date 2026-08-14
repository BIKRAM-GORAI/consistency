// GitHub Direct-to-Browser REST and GraphQL API Service

// Global diagnostics diagnostics tracker
window.githubDiagnostics = {
  restRequests: 0,
  graphqlRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimitLimit: 5000,
  rateLimitRemaining: 5000,
  rateLimitReset: null,
  graphqlCost: 0,
  lastUpdate: null,
  isOffline: false
};

const GITHUB_REST_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_BASE = 'https://api.github.com/graphql';

let githubAccessToken = null;

// Service definition
window.githubService = {
  setToken(token) {
    githubAccessToken = token;
  },

  isConfigured() {
    return !!githubAccessToken;
  },

  // REST API Client helper
  async fetchREST(endpoint, options = {}) {
    if (!githubAccessToken) {
      throw new Error('GitHub access token is not set.');
    }

    window.githubDiagnostics.restRequests++;
    window.githubDiagnostics.cacheMisses++;

    const headers = {
      'Authorization': `Bearer ${githubAccessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers
    };

    try {
      const response = await fetch(`${GITHUB_REST_BASE}${endpoint}`, {
        ...options,
        headers
      });

      window.githubDiagnostics.isOffline = false;

      // Track rate limits from headers
      const limit = response.headers.get('x-ratelimit-limit');
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      
      if (limit) window.githubDiagnostics.rateLimitLimit = parseInt(limit);
      if (remaining) window.githubDiagnostics.rateLimitRemaining = parseInt(remaining);
      if (reset) window.githubDiagnostics.rateLimitReset = new Date(parseInt(reset) * 1000);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('GitHub token unauthorized or expired.');
        } else if (response.status === 403 && remaining === '0') {
          throw new Error('GitHub API rate limit exceeded.');
        }
        throw new Error(`GitHub REST Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch')) {
        window.githubDiagnostics.isOffline = true;
      }
      throw err;
    }
  },

  // GraphQL API Client helper
  async fetchGraphQL(query, variables = {}) {
    if (!githubAccessToken) {
      throw new Error('GitHub access token is not set.');
    }

    window.githubDiagnostics.graphqlRequests++;
    window.githubDiagnostics.cacheMisses++;

    const headers = {
      'Authorization': `Bearer ${githubAccessToken}`,
      'Content-Type': 'application/json'
    };

    try {
      const response = await fetch(GITHUB_GRAPHQL_BASE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables })
      });

      window.githubDiagnostics.isOffline = false;

      if (!response.ok) {
        throw new Error(`GitHub GraphQL HTTP Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        throw new Error(`GitHub GraphQL Error: ${result.errors[0].message}`);
      }

      // Parse rate limits if included in result
      if (result.data && result.data.rateLimit) {
        const rl = result.data.rateLimit;
        window.githubDiagnostics.rateLimitLimit = rl.limit;
        window.githubDiagnostics.rateLimitRemaining = rl.remaining;
        window.githubDiagnostics.rateLimitReset = new Date(rl.resetAt);
        window.githubDiagnostics.graphqlCost += rl.cost || 0;
      }

      return result.data;
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch')) {
        window.githubDiagnostics.isOffline = true;
      }
      throw err;
    }
  },

  // Clean offline cached retrieval
  getCachedData() {
    try {
      const data = localStorage.getItem('cached_github_analytics_data');
      if (data) {
        window.githubDiagnostics.cacheHits++;
        const parsed = JSON.parse(data);
        if (parsed && parsed.diagnostics) {
          window.githubDiagnostics.lastUpdate = parsed.diagnostics.lastUpdate;
        }
        return parsed;
      }
    } catch (e) {
      console.error('Error reading GitHub cache from localStorage:', e);
    }
    return null;
  },

  // Clear local cache
  clearCache() {
    localStorage.removeItem('cached_github_analytics_data');
    githubAccessToken = null;
  },

  // Master Orchestrator: Fetches online details, normalizes everything, updates local storage
  async fetchFullAnalytics() {
    try {
      // 1. Fetch viewer profile to get current user login name
      const restProfile = await this.fetchREST('/user');
      const login = restProfile.login;

      // 2. Query primary profile, repositories, contributions, and organizations via GraphQL
      const mainQuery = `
        query($login: String!) {
          rateLimit {
            limit
            remaining
            resetAt
            cost
          }
          user(login: $login) {
            login
            name
            avatarUrl
            bio
            company
            location
            email
            twitterUsername
            websiteUrl
            createdAt
            url
            followers { totalCount }
            following { totalCount }
            socialAccounts(first: 10) {
              nodes {
                displayName
                provider
                url
              }
            }
            repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
              totalCount
              nodes {
                id
                name
                nameWithOwner
                description
                url
                homepageUrl
                isPrivate
                isFork
                isArchived
                stargazerCount
                forkCount
                watchers {
                  totalCount
                }
                diskUsage
                defaultBranchRef {
                  name
                  target {
                    ... on Commit {
                      history { totalCount }
                    }
                  }
                }
                createdAt
                updatedAt
                pushedAt
                repositoryTopics(first: 10) {
                  nodes {
                    topic { name }
                  }
                }
                languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                  totalSize
                  edges {
                    size
                    node {
                      name
                      color
                    }
                  }
                }
                releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) {
                  nodes {
                    name
                    tagName
                    publishedAt
                    url
                    author { login }
                  }
                }
                deployments(first: 5) {
                  nodes {
                    id
                    environment
                    state
                    createdAt
                    creator { login }
                  }
                }
              }
            }
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                    color
                  }
                }
              }
            }

          }
        }
      `;

      const mainData = await this.fetchGraphQL(mainQuery, { login });
      const gqlUser = mainData.user;

      // 3. Query pull requests and issues (authored by user) in a single unified GraphQL Search query
      const searchQuery = `
        query($queryPr: String!, $queryIssue: String!) {
          rateLimit {
            limit
            remaining
            resetAt
            cost
          }
          prs: search(query: $queryPr, type: ISSUE, first: 100) {
            issueCount
            nodes {
              ... on PullRequest {
                id
                number
                title
                state
                createdAt
                updatedAt
                closedAt
                mergedAt
                merged
                isDraft
                url
                repository { nameWithOwner }
              }
            }
          }
          issues: search(query: $queryIssue, type: ISSUE, first: 100) {
            issueCount
            nodes {
              ... on Issue {
                id
                number
                title
                state
                createdAt
                closedAt
                url
                repository { nameWithOwner }
                labels(first: 5) {
                  nodes { name color }
                }
              }
            }
          }
        }
      `;

      const searchData = await this.fetchGraphQL(searchQuery, {
        queryPr: `author:${login} type:pr`,
        queryIssue: `author:${login} type:issue`
      });

      // 4. Fetch User Activity Events (Push, Pull Request, Commit, Fork events) via REST (useful for timeline)
      let events = [];
      try {
        events = await this.fetchREST(`/users/${login}/events?per_page=30`);
      } catch (e) {
        console.warn('Failed to load user events timeline:', e.message);
      }

      // 4b. Fetch Organizations via REST (/user/orgs) — does NOT require read:org scope
      let normalizedOrgs = [];
      try {
        const orgsRaw = await this.fetchREST('/user/orgs?per_page=30');
        normalizedOrgs = (orgsRaw || []).map(o => ({
          name: o.login,
          login: o.login,
          avatarUrl: o.avatar_url,
          url: o.url ? o.url.replace('api.github.com/orgs', 'github.com') : `https://github.com/${o.login}`,
          description: o.description || 'No description provided'
        }));
      } catch (e) {
        console.warn('Failed to load organizations (no read:org scope):', e.message);
      }

      // 5. Parse and Normalize Data
      const normalizedUser = this.normalizeUser(gqlUser, restProfile);
      const normalizedRepos = (gqlUser.repositories.nodes || []).map(r => this.normalizeRepository(r));
      const normalizedContributions = this.normalizeContributions(gqlUser.contributionsCollection.contributionCalendar);
      const normalizedPrs = this.normalizePullRequests(searchData.prs);
      const normalizedIssues = this.normalizeIssues(searchData.issues);

      // Extract inline releases & deployments
      const allReleases = [];
      const allDeployments = [];
      normalizedRepos.forEach(repo => {
        if (repo.rawReleases) {
          repo.rawReleases.forEach(rel => {
            allReleases.push({
              name: rel.name || rel.tagName,
              tagName: rel.tagName,
              publishedAt: rel.publishedAt,
              repo: repo.nameWithOwner,
              author: rel.author ? rel.author.login : 'unknown',
              url: rel.url
            });
          });
        }
        if (repo.rawDeployments) {
          repo.rawDeployments.forEach(dep => {
            allDeployments.push({
              id: dep.id,
              repo: repo.nameWithOwner,
              environment: dep.environment,
              status: dep.state,
              creator: dep.creator ? dep.creator.login : 'unknown',
              createdAt: dep.createdAt
            });
          });
        }
      });

      // Sort timeline releases and deployments chronologically
      allReleases.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      allDeployments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Calculate aggregated metrics deterministically
      const analytics = this.calculateAnalytics(normalizedRepos, normalizedContributions, normalizedPrs, normalizedIssues, allReleases, allDeployments);
      
      const timelineEvents = this.normalizeActivityEvents(events);

      const finalPayload = {
        user: normalizedUser,
        repos: normalizedRepos,
        contributions: normalizedContributions,
        prs: normalizedPrs,
        issues: normalizedIssues,
        orgs: normalizedOrgs,
        releases: allReleases,
        deployments: allDeployments,
        timelineEvents,
        analytics,
        diagnostics: {
          lastUpdate: new Date().toISOString(),
          rateLimitLimit: window.githubDiagnostics.rateLimitLimit,
          rateLimitRemaining: window.githubDiagnostics.rateLimitRemaining,
          rateLimitReset: window.githubDiagnostics.rateLimitReset
        }
      };

      // Save to localStorage cache
      localStorage.setItem('cached_github_analytics_data', JSON.stringify(finalPayload));
      window.githubDiagnostics.lastUpdate = finalPayload.diagnostics.lastUpdate;

      return finalPayload;
    } catch (error) {
      console.error('Failed to compile full GitHub analytics:', error);
      throw error;
    }
  },

  // Helper to fetch Actions runs dynamically when a specific repo tab becomes active (lazy-loaded)
  async fetchWorkflowRuns(owner, repo) {
    try {
      const data = await this.fetchREST(`/repos/${owner}/${repo}/actions/runs?per_page=15`);
      return (data.workflow_runs || []).map(run => ({
        id: run.id,
        name: run.name,
        repo: `${owner}/${repo}`,
        conclusion: run.conclusion,
        status: run.status,
        branch: run.head_branch,
        startedAt: run.run_started_at || run.created_at,
        duration: run.updated_at ? Math.round((new Date(run.updated_at) - new Date(run.run_started_at || run.created_at)) / 1000) : null,
        trigger: run.event,
        commitSha: run.head_sha,
        url: run.html_url
      }));
    } catch (e) {
      console.warn(`Could not load Actions workflows for ${owner}/${repo}:`, e.message);
      return [];
    }
  },

  // Helper to fetch repo traffic (views/clones) dynamically (lazy-loaded & permission aware)
  async fetchRepoTraffic(owner, repo) {
    try {
      // Views
      const viewsRes = await this.fetchREST(`/repos/${owner}/${repo}/traffic/views`);
      const clonesRes = await this.fetchREST(`/repos/${owner}/${repo}/traffic/clones`);
      const referrersRes = await this.fetchREST(`/repos/${owner}/${repo}/traffic/popular/referrers`);

      return {
        viewsCount: viewsRes.count || 0,
        uniquesCount: viewsRes.uniques || 0,
        clonesCount: clonesRes.count || 0,
        clonersCount: clonesRes.uniques || 0,
        referrers: (referrersRes || []).slice(0, 5).map(ref => ({
          source: ref.referrer,
          count: ref.count,
          uniques: ref.uniques
        })),
        available: true
      };
    } catch (e) {
      console.warn(`Traffic API locked or unavailable for ${owner}/${repo}:`, e.message);
      return { available: false, reason: e.message };
    }
  },

  // Normalizer: User profile
  normalizeUser(gqlUser, restProfile) {
    const ageDiff = Date.now() - new Date(gqlUser.createdAt).getTime();
    const ageYears = (ageDiff / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);

    // Build social accounts list from GraphQL socialAccounts connection
    const socials = (gqlUser.socialAccounts && gqlUser.socialAccounts.nodes || []).map(s => ({
      provider: s.provider,
      displayName: s.displayName,
      url: s.url
    }));
    // Include twitter if set separately
    if (gqlUser.twitterUsername && !socials.find(s => s.provider === 'TWITTER')) {
      socials.unshift({ provider: 'TWITTER', displayName: `@${gqlUser.twitterUsername}`, url: `https://twitter.com/${gqlUser.twitterUsername}` });
    }

    return {
      login: gqlUser.login,
      name: gqlUser.name || gqlUser.login,
      avatarUrl: gqlUser.avatarUrl,
      bio: gqlUser.bio || 'No biography details provided.',
      company: gqlUser.company || 'Not Specified',
      location: gqlUser.location || 'Not Specified',
      email: gqlUser.email || restProfile.email || '',
      websiteUrl: gqlUser.websiteUrl || restProfile.blog || 'Not Specified',
      twitterUsername: gqlUser.twitterUsername || '',
      socialAccounts: socials,
      createdAt: gqlUser.createdAt,
      accountAgeYears: ageYears,
      followersCount: gqlUser.followers.totalCount,
      followingCount: gqlUser.following.totalCount,
      publicReposCount: restProfile.public_repos || 0,
      publicGistsCount: restProfile.public_gists || 0,
      profileUrl: gqlUser.url
    };
  },

  // Normalizer: Repository
  normalizeRepository(node) {
    // Process language byte splits
    const languages = [];
    const totalSize = node.languages.totalSize || 0;
    (node.languages.edges || []).forEach(edge => {
      const pct = totalSize > 0 ? ((edge.size / totalSize) * 100).toFixed(1) : 0;
      languages.push({
        name: edge.node.name,
        color: edge.node.color,
        size: edge.size,
        percentage: parseFloat(pct)
      });
    });

    const topics = (node.repositoryTopics.nodes || []).map(t => t.topic.name);
    const commitCount = node.defaultBranchRef && node.defaultBranchRef.target && node.defaultBranchRef.target.history
      ? node.defaultBranchRef.target.history.totalCount
      : null;

    return {
      id: node.id,
      name: node.name,
      nameWithOwner: node.nameWithOwner,
      description: node.description || 'No description provided.',
      url: node.url,
      homepage: node.homepageUrl || '',
      isPrivate: node.isPrivate,
      isFork: node.isFork,
      isArchived: node.isArchived,
      stars: node.stargazerCount,
      forks: node.forkCount,
      watchers: node.watchers ? node.watchers.totalCount : 0,
      sizeKb: node.diskUsage,
      defaultBranch: node.defaultBranchRef ? node.defaultBranchRef.name : 'main',
      commitCount,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      pushedAt: node.pushedAt,
      languages,
      topics,
      rawReleases: node.releases.nodes || [],
      rawDeployments: node.deployments.nodes || []
    };
  },

  // Normalizer: Contributions collection and streaks calculations
  normalizeContributions(calendar) {
    const total = calendar.totalContributions;
    const days = [];
    
    calendar.weeks.forEach(w => {
      w.contributionDays.forEach(d => {
        days.push({
          count: d.contributionCount,
          date: d.date,
          color: d.color
        });
      });
    });

    // Sort ascending by date
    days.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    // Find streaks from sorted days
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    days.forEach(d => {
      if (d.count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    });

    // Calculate current streak (must end today or yesterday)
    let currentStreakTemp = 0;
    let active = false;
    
    // Loop backwards from today
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.count > 0) {
        active = true;
        currentStreakTemp++;
      } else {
        // If we hit a zero day, stop unless we haven't hit today/yesterday yet
        if (active) break;
        if (d.date !== todayStr && d.date !== yesterdayStr) {
          break; // Streak is dead
        }
      }
    }
    currentStreak = currentStreakTemp;

    // Find most active day
    let activeDay = { count: 0, date: 'N/A' };
    days.forEach(d => {
      if (d.count > activeDay.count) {
        activeDay = { count: d.count, date: d.date };
      }
    });

    // Find most active month
    const monthlySums = {};
    days.forEach(d => {
      const month = d.date.substring(0, 7); // YYYY-MM
      monthlySums[month] = (monthlySums[month] || 0) + d.count;
    });

    let activeMonth = { count: 0, name: 'N/A' };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    Object.keys(monthlySums).forEach(m => {
      if (monthlySums[m] > activeMonth.count) {
        const parts = m.split('-');
        const monthLabel = `${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
        activeMonth = { count: monthlySums[m], name: monthLabel };
      }
    });

    const activeDaysCount = days.filter(d => d.count > 0).length;
    const dailyAverage = (total / (days.length || 1)).toFixed(1);

    return {
      totalContributions: total,
      days,
      currentStreak,
      longestStreak,
      activeDaysCount,
      dailyAverage: parseFloat(dailyAverage),
      activeDay,
      activeMonth
    };
  },

  // Normalizer: Pull Requests
  normalizePullRequests(searchPrs) {
    const items = (searchPrs.nodes || []).map(node => ({
      id: node.id,
      number: node.number,
      title: node.title,
      state: node.state,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      closedAt: node.closedAt,
      mergedAt: node.mergedAt,
      merged: node.merged,
      isDraft: node.isDraft,
      url: node.url,
      repository: node.repository ? node.repository.nameWithOwner : 'unknown'
    }));

    const total = searchPrs.issueCount || items.length;
    const openCount = items.filter(pr => pr.state === 'OPEN').length;
    const closedCount = items.filter(pr => pr.state === 'CLOSED').length;
    const mergedCount = items.filter(pr => pr.merged).length;
    const mergeRate = total > 0 ? Math.round((mergedCount / total) * 100) : 0;

    return {
      totalPrs: total,
      openCount,
      closedCount,
      mergedCount,
      mergeRate,
      items
    };
  },

  // Normalizer: Issues
  normalizeIssues(searchIssues) {
    const items = (searchIssues.nodes || []).map(node => ({
      id: node.id,
      number: node.number,
      title: node.title,
      state: node.state,
      createdAt: node.createdAt,
      closedAt: node.closedAt,
      url: node.url,
      repository: node.repository ? node.repository.nameWithOwner : 'unknown',
      labels: (node.labels.nodes || []).map(l => ({ name: l.name, color: l.color }))
    }));

    const total = searchIssues.issueCount || items.length;
    const openCount = items.filter(i => i.state === 'OPEN').length;
    const closedCount = items.filter(i => i.state === 'CLOSED').length;

    return {
      totalIssues: total,
      openCount,
      closedCount,
      items
    };
  },

  // Normalizer: Public Activity Timeline
  normalizeActivityEvents(events) {
    const timeline = [];
    
    (events || []).forEach(ev => {
      let desc = '';
      let icon = 'activity';
      let type = ev.type;
      
      switch (ev.type) {
        case 'PushEvent':
          const commitCount = ev.payload.commits ? ev.payload.commits.length : 1;
          desc = `Pushed ${commitCount} commit(s) to branch ${ev.payload.ref ? ev.payload.ref.replace('refs/heads/', '') : 'main'}`;
          icon = 'git-commit';
          break;
        case 'CreateEvent':
          desc = `Created new ${ev.payload.ref_type} "${ev.payload.ref || ev.repo.name}"`;
          icon = 'plus-circle';
          break;
        case 'WatchEvent':
          desc = `Starred repository`;
          icon = 'star';
          break;
        case 'ForkEvent':
          desc = `Forked repository to ${ev.payload.forkee.full_name}`;
          icon = 'git-fork';
          break;
        case 'IssuesEvent':
          desc = `${ev.payload.action.charAt(0).toUpperCase() + ev.payload.action.slice(1)} issue #${ev.payload.issue.number}: "${ev.payload.issue.title}"`;
          icon = 'alert-circle';
          break;
        case 'PullRequestEvent':
          desc = `${ev.payload.action.charAt(0).toUpperCase() + ev.payload.action.slice(1)} Pull Request #${ev.payload.number}: "${ev.payload.pull_request.title}"`;
          icon = 'git-pull-request';
          break;
        case 'ReleaseEvent':
          desc = `Published release version ${ev.payload.release.tag_name}`;
          icon = 'package';
          break;
        case 'IssueCommentEvent':
          desc = `Commented on issue #${ev.payload.issue.number}`;
          icon = 'message-square';
          break;
        default:
          desc = `Performed activity in repository`;
          icon = 'activity';
      }

      timeline.push({
        id: ev.id,
        type,
        repo: ev.repo.name,
        timestamp: ev.created_at,
        url: `https://github.com/${ev.repo.name}`,
        description: desc,
        icon
      });
    });

    return timeline;
  },

  // Stats aggregator engine
  calculateAnalytics(repos, contributions, prs, issues, releases, deployments) {
    const totalRepos = repos.length;
    const forksCount = repos.filter(r => r.isFork).length;
    const originalCount = totalRepos - forksCount;

    // Total stars and forks received
    let totalStars = 0;
    let totalForks = 0;
    repos.forEach(r => {
      totalStars += r.stars;
      totalForks += r.forks;
    });

    // Language aggregates
    const langTotals = {};
    let totalCodeSize = 0;
    
    repos.forEach(r => {
      r.languages.forEach(l => {
        langTotals[l.name] = (langTotals[l.name] || 0) + l.size;
        totalCodeSize += l.size;
      });
    });

    const languagesDistribution = [];
    Object.keys(langTotals).forEach(name => {
      const size = langTotals[name];
      const percentage = totalCodeSize > 0 ? ((size / totalCodeSize) * 100).toFixed(1) : 0;
      languagesDistribution.push({
        name,
        size,
        percentage: parseFloat(percentage),
        repoCount: repos.filter(r => r.languages.some(l => l.name === name)).length
      });
    });

    // Sort languages by size descending
    languagesDistribution.sort((a, b) => b.size - a.size);

    // Filter top popularity rankings
    const popularRepos = [...repos];
    popularRepos.sort((a, b) => b.stars - a.stars);
    const topPopular = popularRepos.slice(0, 5).map(r => ({
      name: r.nameWithOwner,
      stars: r.stars,
      forks: r.forks,
      url: r.url
    }));

    return {
      totalRepos,
      originalCount,
      forksCount,
      totalStars,
      totalForks,
      languagesDistribution: languagesDistribution.slice(0, 8), // top 8
      topPopular,
      totalReleases: releases.length,
      totalDeployments: deployments.length
    };
  }
};
