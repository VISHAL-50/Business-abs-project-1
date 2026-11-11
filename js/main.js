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

  /* ---------- Popup: Q1 → Q2 → Details → OTP → thank-you.html ---------- */
  var THANK_YOU_URL = 'thank-you.html';
  var RESEND_SECONDS = 30;

  /* === BACKEND HOOKS ===
     Right now these are DEMO functions (no real SMS is sent, any 6 digits are accepted).
     Replace the bodies with calls to your SMS/OTP provider (MSG91, Twilio, 2Factor, Firebase…)
     through your own server. Both must return a Promise. */
  function sendOtp(lead) {
    console.log('[DEMO] sendOtp →', lead);
    // return fetch('/api/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
    return Promise.resolve();
  }
  function verifyOtp(lead, code) {
    console.log('[DEMO] verifyOtp →', lead.phone, code);
    // return fetch('/api/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: lead.phone, code: code }) })
    //   .then(function (r) { return r.ok; });
    return Promise.resolve(/^\d{6}$/.test(code));
  }

  var modal = document.getElementById('qualifyModal');
  var form = document.getElementById('qualifyForm');
  var steps = form.querySelectorAll('.q');
  var otpInputs = form.querySelectorAll('[data-otp] input');
  var resendBtn = form.querySelector('[data-resend]');
  var resendLabel = form.querySelector('[data-resend-timer]');
  var resendTimer = null;
  var lead = {};

  function stepEl(n) { return form.querySelector('.q[data-step="' + n + '"]'); }
  function setError(n, msg) { stepEl(n).querySelector('.q-error').textContent = msg || ''; }
  function showStep(n) {
    steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
    var first = stepEl(n).querySelector('input:not([type=radio])');
    if (first) setTimeout(function () { first.focus(); }, 50);
  }
  function openModal(e) {
    if (e) e.preventDefault();
    form.reset();
    form.querySelectorAll('.q-error').forEach(function (el) { el.textContent = ''; });
    showStep(1);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
  function setLoading(btn, on, text) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = text; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  document.querySelectorAll('[data-popup]').forEach(function (btn) {
    btn.addEventListener('click', openModal);
  });
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  // Step 1 & 2: Yes/No questions
  function radioStep(n, name) {
    if (!form.querySelector('input[name="' + name + '"]:checked')) {
      setError(n, 'Please select Yes or No to continue.');
      return false;
    }
    setError(n, '');
    return true;
  }
  stepEl(1).querySelector('[data-next]').addEventListener('click', function () {
    if (radioStep(1, 'gst')) showStep(2);
  });
  stepEl(2).querySelector('[data-next]').addEventListener('click', function () {
    if (radioStep(2, 'turnover')) showStep(3);
  });

  // Step 3: details → send OTP
  form.phone.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
  stepEl(3).querySelector('[data-next]').addEventListener('click', function () {
    var btn = this;
    var name = form.name.value.trim();
    var email = form.email.value.trim();
    var phone = form.phone.value.trim();
    if (name.length < 2) return setError(3, 'Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(3, 'Please enter a valid email address.');
    if (!/^[6-9]\d{9}$/.test(phone)) return setError(3, 'Please enter a valid 10-digit mobile number.');
    setError(3, '');

    lead = { name: name, email: email, phone: '+91' + phone, gst: form.gst.value, turnover: form.turnover.value };
    setLoading(btn, true, 'Sending code…');
    sendOtp(lead).then(function () {
      setLoading(btn, false);
      form.querySelector('[data-phone-label]').textContent = '+91 ' + phone;
      otpInputs.forEach(function (i) { i.value = ''; });
      setError(4, '');
      startResendTimer();
      showStep(4);
    }).catch(function () {
      setLoading(btn, false);
      setError(3, 'Could not send the code. Please try again.');
    });
  });

  form.querySelector('[data-back]').addEventListener('click', function () { showStep(3); });

  // OTP boxes: auto-advance, backspace, paste
  otpInputs.forEach(function (input, i) {
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(-1);
      if (input.value && otpInputs[i + 1]) otpInputs[i + 1].focus();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !input.value && otpInputs[i - 1]) otpInputs[i - 1].focus();
    });
    input.addEventListener('paste', function (e) {
      var digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (!digits) return;
      e.preventDefault();
      digits.split('').forEach(function (d, k) { if (otpInputs[k]) otpInputs[k].value = d; });
      otpInputs[Math.min(digits.length, 6) - 1].focus();
    });
  });

  function startResendTimer() {
    var left = RESEND_SECONDS;
    resendBtn.disabled = true;
    clearInterval(resendTimer);
    resendLabel.textContent = '(' + left + 's)';
    resendTimer = setInterval(function () {
      left -= 1;
      resendLabel.textContent = left > 0 ? '(' + left + 's)' : '';
      if (left <= 0) { clearInterval(resendTimer); resendBtn.disabled = false; }
    }, 1000);
  }
  resendBtn.addEventListener('click', function () {
    sendOtp(lead).then(startResendTimer);
  });

  // Step 4: verify → redirect to thank-you page
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (stepEl(4).hidden) return; // Enter key on earlier steps does nothing
    var code = Array.prototype.map.call(otpInputs, function (i) { return i.value; }).join('');
    if (code.length !== 6) return setError(4, 'Please enter the 6-digit code.');
    var btn = form.querySelector('button[type=submit]');
    setLoading(btn, true, 'Verifying…');
    verifyOtp(lead, code).then(function (ok) {
      setLoading(btn, false);
      if (!ok) return setError(4, 'That code is incorrect. Please try again.');
      try { sessionStorage.setItem('bsb_lead', JSON.stringify(lead)); } catch (err) { }
      window.location.href = THANK_YOU_URL + '?name=' + encodeURIComponent(lead.name.split(' ')[0]);
    }).catch(function () {
      setLoading(btn, false);
      setError(4, 'Verification failed. Please try again.');
    });
  });
})();
