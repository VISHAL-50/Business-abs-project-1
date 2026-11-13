(function () {
  /* ---------- Google Drive videos: click thumbnail → load player ----------
     Add data-drive-id="FILE_ID" to any box that has a .play button. */
  document.querySelectorAll('[data-drive-id]').forEach(function (box) {
    box.querySelector('.play').addEventListener('click', function () {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://drive.google.com/file/d/' + box.dataset.driveId + '/preview';
      iframe.allow = 'autoplay; fullscreen';
      iframe.allowFullscreen = true;
      box.innerHTML = '';
      box.appendChild(iframe);
    });
  });

  /* ---------- Local videos: click thumbnail → play the file from assets/videos ----------
     Add data-video-src="assets/videos/FILE.mp4" to any box that has a .play button.
     The video only starts downloading after the click, so the page itself stays fast. */
  document.querySelectorAll('[data-video-src]').forEach(function (box) {
    box.querySelector('.play').addEventListener('click', function () {
      var video = document.createElement('video');
      video.src = box.dataset.videoSrc;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      box.innerHTML = '';
      box.appendChild(video);
    });
  });

  /* ---------- Countdown (22 Nov 2026, 10:00 AM IST) ---------- */
  var target = new Date('2026-11-22T10:00:00+05:30').getTime();
  var cd = {};
  document.querySelectorAll('[data-cd]').forEach(function (el) { cd[el.dataset.cd] = el; });
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    var diff = Math.max(0, target - Date.now());
    var s = Math.floor(diff / 1000);
    cd.d.textContent = pad(Math.floor(s / 86400));
    cd.h.textContent = pad(Math.floor((s % 86400) / 3600));
    cd.m.textContent = pad(Math.floor((s % 3600) / 60));
    cd.s.textContent = pad(s % 60);
  }
  if (cd.d) { tick(); setInterval(tick, 1000); }

  /* ---------- B2B / B2C tabs ---------- */
  var data = {
    b2b: {
      c: [
        'Long sales cycles — follow-ups drag for weeks or months.',
        'Clients demand heavy discounts before signing contracts.',
        'Marketing generates leads, but decision-makers are unreachable.',
        'Heavy dependence on founder for negotiation and closure.',
        "Team doesn't understand how to convert corporate buyers logically."
      ],
      s: [
        'Build a predictable sales pipeline with CRM-driven follow-ups.',
        'Train your team to close corporate clients faster using psychology-based scripts.',
        'Reduce founder dependency by systemizing proposals, demos, and follow-ups.',
        'Implement tracking dashboards for B2B deal progress and conversions.',
        'Align marketing and sales departments with unified KPIs.'
      ]
    },
    b2c: {
      c: [
        'High customer acquisition costs reduce overall profitability.',
        'Many enquiries and website visitors fail to convert into paying customers.',
        'Customers compare prices and choose competitors offering better deals.',
        'Low repeat purchases make revenue unpredictable.',
        'Poor customer follow-ups result in abandoned carts and lost sales.'
      ],
      s: [
        'Improve marketing efficiency by targeting high-intent customers and tracking acquisition costs.',
        'Optimize the customer journey, landing pages, and sales process to increase conversions.',
        'Strengthen brand positioning to communicate value beyond price discounts.',
        'Build retention campaigns and loyalty strategies to encourage repeat purchases.',
        'Automate follow-ups through email, WhatsApp, and CRM-based customer journeys.'
      ]
    }
  };
  var lists = {
    c: document.querySelector('[data-list="c"]'),
    s: document.querySelector('[data-list="s"]')
  };
  function renderTab(key) {
    ['c', 's'].forEach(function (k) {
      lists[k].innerHTML = data[key][k].map(function (t) { return '<li>' + t + '</li>'; }).join('');
    });
  }
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      renderTab(tab.dataset.tab);
    });
  });
  renderTab('b2b');

  /* ---------- Carousel ---------- */
  var track = document.getElementById('attendTrack');
  var carousel = track.closest('.carousel');
  var AUTOPLAY_MS = 3000;
  var timer = null;

  function slide(dir) {
    var card = track.querySelector('.attend');
    var step = card.offsetWidth + 16; // card width + gap
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 5;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0 });                         // loop to start
    else if (dir < 0 && track.scrollLeft <= 5) track.scrollTo({ left: track.scrollWidth }); // loop to end
    else track.scrollBy({ left: dir * step });
  }
  function startAuto() { stopAuto(); timer = setInterval(function () { slide(1); }, AUTOPLAY_MS); }
  function stopAuto() { if (timer) clearInterval(timer); timer = null; }

  document.querySelectorAll('.car-nav button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      slide(Number(btn.dataset.dir));
      startAuto(); // restart timer after manual navigation
    });
  });

  // Pause while the user hovers or touches the carousel, resume after
  carousel.addEventListener('mouseenter', stopAuto);
  carousel.addEventListener('mouseleave', startAuto);
  track.addEventListener('touchstart', stopAuto, { passive: true });
  track.addEventListener('touchend', startAuto);
  startAuto();

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.fq button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var ans = item.querySelector('.ans');
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.fq.open').forEach(function (o) {
        o.classList.remove('open');
        o.querySelector('.ans').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });
})();
