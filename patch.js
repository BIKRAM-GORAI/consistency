const fs = require('fs');

let content = fs.readFileSync('frontend/script.js', 'utf-8');

// 1. Remove chipImg.onclick
content = content.replace('chipImg.onclick = (e) => { e.stopPropagation(); openLightbox(userProfilePicture); };', '');

// 2. Add public-profile-toggle parsing
content = content.replace(
    "if (toggle) toggle.checked = res.emailNotifications;",
    "if (toggle) toggle.checked = res.emailNotifications;\n    const publicToggle = document.getElementById('public-profile-toggle');\n    if (publicToggle) publicToggle.checked = res.isPublicProfile !== false;"
);

// 3. Add isPublicProfile grabbing
content = content.replace(
    "const emailNotifications = document.getElementById('email-notif-toggle').checked;",
    "const emailNotifications = document.getElementById('email-notif-toggle').checked;\n  const isPublicProfile = document.getElementById('public-profile-toggle').checked;"
);

// 4. Add payload
content = content.replace(
    "const payload = { emailNotifications };",
    "const payload = { emailNotifications, isPublicProfile };"
);

fs.writeFileSync('frontend/script.js', content, 'utf-8');
console.log('Patched script.js basics');
