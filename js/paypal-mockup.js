/**
 * PayPal Integration Mockup
 * Simulates a checkout process for premium features.
 */
const PayPalMockup = (() => {
  let modal, overlay, closeBtn, payBtn, statusText, cardInputs, premiumTag;

  function init() {
    modal      = document.getElementById('paypal-modal');
    overlay    = document.getElementById('paypal-overlay');
    closeBtn   = modal.querySelector('.modal-close');
    payBtn     = modal.querySelector('#paypal-pay-btn');
    statusText = modal.querySelector('#paypal-status');
    cardInputs = modal.querySelector('.card-form');
    premiumTag = document.getElementById('premium-badge');

    // Button to open modal (from landing page)
    const openBtns = document.querySelectorAll('.btn-premium-toggle');
    openBtns.forEach(btn => btn.addEventListener('click', open));

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
    payBtn.addEventListener('click', handlePayment);
  }

  function open() {
    modal.classList.add('active');
    overlay.classList.add('active');
    statusText.textContent = '';
    statusText.className = '';
    cardInputs.style.display = 'grid';
    payBtn.style.display = 'block';
  }

  function close() {
    modal.classList.remove('active');
    overlay.classList.remove('active');
  }

  function handlePayment() {
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';
    
    // Simulate API delay
    setTimeout(() => {
      cardInputs.style.display = 'none';
      payBtn.style.display = 'none';
      
      statusText.textContent = 'Payment Successful! Premium Unlocked.';
      statusText.className = 'status-success';
      
      // Unlock premium badge in UI
      if (premiumTag) {
        premiumTag.classList.add('unlocked');
        premiumTag.textContent = 'PREMIUM UNLOCKED';
      }

      // Hide modal after 2 seconds
      setTimeout(close, 2000);
      payBtn.disabled = false;
      payBtn.textContent = 'Pay with PayPal';

      // Persist unlock state
      localStorage.setItem('arcade_premium_unlocked', 'true');
    }, 2500);
  }

  return { init, open };
})();

// Initialize on load
document.addEventListener('DOMContentLoaded', PayPalMockup.init);
