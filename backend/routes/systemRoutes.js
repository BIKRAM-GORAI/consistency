const express = require('express');
const router = express.Router();
const axios = require('axios');

// Current System Version (Bump this to force all clients to update)
const APP_VERSION = '2.1.0'; 


router.get('/version', (req, res) => {
  res.json({ 
    version: APP_VERSION,
    forceUpdate: true,
    message: 'New features and offline stability improvements available.'
  });
});

// Keyless YouTube Search Proxy Scraper
router.get('/yt-search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Missing search query parameter q' });
    }

    const response = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = response.data;
    const videos = [];

    // Parse ytInitialData JSON structure
    let jsonStr = '';
    const marker = 'ytInitialData = ';
    const index = html.indexOf(marker);
    if (index !== -1) {
      const start = index + marker.length;
      const end = html.indexOf(';</script>', start);
      if (end !== -1) {
        jsonStr = html.substring(start, end).trim();
      }
    }

    if (jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
        if (Array.isArray(contents)) {
          for (const item of contents) {
            if (item.videoRenderer) {
              const vr = item.videoRenderer;
              const videoId = vr.videoId;
              const title = vr.title?.runs?.[0]?.text || 'No Title';
              const thumbnailUrl = vr.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
              const duration = vr.lengthText?.simpleText || '';
              const channel = vr.ownerText?.runs?.[0]?.text || '';
              
              if (videoId && videoId.length === 11) {
                videos.push({ videoId, title, thumbnailUrl, duration, channel });
              }
              if (videos.length >= 8) break; // Get top 8 results
            }
          }
        }
      } catch (parseErr) {
        console.warn('JSON parsing of ytInitialData failed, using fallback:', parseErr.message);
      }
    }

    // Double-safe fallback regex if videos list is empty
    if (videos.length === 0) {
      const regex = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
      let m;
      let count = 0;
      while ((m = regex.exec(html)) !== null && count < 8) {
        const videoId = m[1];
        const title = m[2];
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        videos.push({ videoId, title, thumbnailUrl, duration: '', channel: '' });
        count++;
      }
    }

    if (videos.length > 0) {
      return res.json({ videos });
    }

    return res.status(404).json({ error: 'No video results found' });
  } catch (err) {
    console.error('YouTube Proxy Search Error:', err.message);
    res.status(500).json({ error: 'Failed to search YouTube', details: err.message });
  }
});

// Keyless Spotify Public Playlist Scraper
router.get('/spotify-search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Missing search query parameter q' });
    }

    const response = await axios.get(`https://html.duckduckgo.com/html/?q=site:open.spotify.com/playlist+${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = response.data;
    const playlists = [];
    
    // Regex to capture open.spotify.com/playlist/PLAYLIST_ID and the result anchor text
    const regex = /href="[^"]*open\.spotify\.com\/playlist\/([a-zA-Z0-9]{22})[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    const ids = new Set();
    
    while ((m = regex.exec(html)) !== null) {
      const id = m[1];
      if (!ids.has(id)) {
        ids.add(id);
        // Strip any HTML tags inside the title matching block
        let title = m[2].replace(/<[^>]*>/g, '').trim();
        // Clean up title common prefixes/suffixes
        title = title.replace(/\s*-\s*playlist\s*by\s*.*$/i, '');
        title = title.replace(/\s*on\s*Spotify\s*$/i, '');
        
        playlists.push({
          playlistId: id,
          title: title || `${q} Focus Mix`,
          thumbnailUrl: 'https://placehold.co/50x38?text=Spotify'
        });
      }
      if (playlists.length >= 6) break;
    }

    if (playlists.length > 0) {
      return res.json({ playlists });
    }

    return res.status(404).json({ error: 'No Spotify playlists found' });
  } catch (err) {
    console.error('Spotify Proxy Search Error:', err.message);
    res.status(500).json({ error: 'Failed to search Spotify', details: err.message });
  }
});

module.exports = router;
