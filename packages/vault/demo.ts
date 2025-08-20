#!/usr/bin/env bun

import { defineVault, redditAdapter, twitterAdapter } from './src';

/**
 * Demo script showing the vault system with full type inference
 * Run with: bun demo.ts
 */

async function main() {
  console.log('🗄️  Vault System Demo\n');
  console.log('====================\n');

  // Create a vault with multiple adapters
  // Notice the 'as const' for better type inference
  const vault = defineVault({
    path: './demo-vault',
    adapters: [redditAdapter, twitterAdapter] as const,
    sync: {
      auto: true,
      strategy: 'batch'
    },
    cache: {
      enabled: true,
      ttl: 5000
    }
  });

  // The magic: TypeScript knows about all subfolders and their methods!
  // Try hovering over 'vault.' in your IDE to see IntelliSense

  console.log('📝 Creating sample data...\n');

  // Create Reddit posts
  const post1 = await vault.posts.create({
    title: 'TypeScript Vault System with Markdown Storage',
    author: 'vault_enthusiast',
    subreddit: 'typescript',
    score: 42,
    num_comments: 7,
    created_at: new Date(),
    url: 'https://reddit.com/r/typescript/example',
    selftext: 'Check out this amazing vault system that uses markdown files as a database!',
    is_video: false,
    is_nsfw: false,
    content: `
# TypeScript Vault System

This is an amazing system that combines:
- Markdown files as storage
- SQLite for querying  
- Full TypeScript type inference
- Plugin-based architecture inspired by BetterAuth

## Why This Matters

Instead of complex database setups, you get human-readable markdown files that can be version controlled, edited directly, and queried like a database!
    `.trim()
  });

  const post2 = await vault.posts.create({
    title: 'Understanding Type Inference in Modern TypeScript',
    author: 'ts_wizard',
    subreddit: 'programming',
    score: 156,
    num_comments: 23,
    created_at: new Date(Date.now() - 3600000), // 1 hour ago
    url: 'https://reddit.com/r/programming/example2',
    selftext: 'Deep dive into advanced TypeScript patterns...',
    is_video: false,
    is_nsfw: false,
  });

  // Create Reddit comments
  const comment1 = await vault.comments.create({
    body: 'This is brilliant! Exactly what I was looking for.',
    author: 'happy_developer',
    post_id: post1.id,
    parent_id: null,
    score: 15,
    created_at: new Date(),
    edited: false,
    awards: ['silver'],
  });

  // Create Twitter data
  const tweet1 = await vault.tweets.create({
    text: 'Just discovered an amazing vault system that uses markdown files as a database! 🚀 #TypeScript #OpenSource',
    author: 'Tech Enthusiast',
    author_username: 'tech_enthusiast',
    likes: 234,
    retweets: 45,
    replies: 12,
    views: 5600,
    created_at: new Date(),
    is_reply: false,
    is_retweet: false,
    has_media: false,
    media_urls: [],
    hashtags: ['TypeScript', 'OpenSource'],
    mentions: [],
    thread_id: null,
    content: 'Check out the GitHub repo for more details!'
  });

  const user1 = await vault.users.create({
    username: 'tech_enthusiast',
    display_name: 'Tech Enthusiast',
    bio: 'Building cool stuff with TypeScript. Open source advocate.',
    location: 'San Francisco, CA',
    website: 'https://example.com',
    followers: 1234,
    following: 567,
    tweets_count: 890,
    created_at: new Date('2020-01-01'),
    verified: false,
    profile_image: 'https://example.com/avatar.jpg',
    banner_image: 'https://example.com/banner.jpg',
  });

  console.log('✅ Sample data created!\n');

  // Demonstrate type-safe queries with IntelliSense
  console.log('🔍 Running queries...\n');

  // Reddit queries - all methods are fully typed!
  const topPosts = await vault.posts.getTopPosts(5);
  console.log(`Top ${topPosts.length} Reddit posts:`);
  topPosts.forEach(post => {
    console.log(`  - "${post.title}" (score: ${post.score})`);
  });

  const programmingPosts = await vault.posts.getBySubreddit('programming');
  console.log(`\nPosts in r/programming: ${programmingPosts.length}`);

  const searchResults = await vault.posts.searchPosts('TypeScript');
  console.log(`\nPosts mentioning TypeScript: ${searchResults.length}`);

  // Twitter queries - also fully typed!
  const viralTweets = await vault.tweets.getViral(100);
  console.log(`\nViral tweets (100+ engagement): ${viralTweets.length}`);

  const trendingTweets = await vault.tweets.getTrending(24);
  console.log(`Trending tweets (last 24h): ${trendingTweets.length}`);

  // User engagement metrics
  const userMetrics = await vault.users.getEngagementMetrics('tech_enthusiast');
  if (userMetrics) {
    console.log(`\n@${userMetrics.username} metrics:`);
    console.log(`  - Followers: ${userMetrics.followers}`);
    console.log(`  - Engagement ratio: ${userMetrics.engagement_ratio.toFixed(2)}`);
    console.log(`  - Tier: ${userMetrics.follower_tier}`);
  }

  // Cross-adapter queries
  console.log('\n📊 Vault statistics:');
  const stats = await vault.$stats();
  console.log(`  - Subfolders: ${stats.subfolders}`);
  console.log(`  - Total records: ${stats.totalRecords}`);

  // Export data
  console.log('\n💾 Exporting vault data...');
  const exported = await vault.$export('json');
  const data = JSON.parse(exported);
  console.log(`  - Exported ${Object.keys(data).length} subfolders`);
  Object.entries(data).forEach(([subfolder, records]) => {
    console.log(`    - ${subfolder}: ${(records as any[]).length} records`);
  });

  // Demonstrate TypeScript catching errors
  console.log('\n🔒 TypeScript type safety demo:');
  console.log('  The following would cause TypeScript errors:');
  console.log('  ❌ vault.nonexistent.getAll() - Property "nonexistent" does not exist');
  console.log('  ❌ vault.posts.nonMethod() - Property "nonMethod" does not exist');
  console.log('  ❌ post1.unknown - Property "unknown" does not exist');
  
  // These work because TypeScript knows the types!
  console.log('\n  ✅ These work with full IntelliSense:');
  console.log(`  ✅ post1.title = "${post1.title}"`);
  console.log(`  ✅ tweet1.likes = ${tweet1.likes}`);
  console.log(`  ✅ user1.followers = ${user1.followers}`);

  console.log('\n✨ Demo complete! Check the ./demo-vault folder to see the markdown files.');
  console.log('   Each record is stored as a markdown file with YAML front matter.');
}

// Run the demo
main().catch(console.error);