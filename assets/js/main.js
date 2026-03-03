/* ==============================
   Mobile nav toggle
   ============================== */
function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('navLinks').classList.remove('open');
  });
});

/* ==============================
   Typing effect (home page only)
   ============================== */
const typedEl = document.getElementById('typed');
if (typedEl) {
  const phrases = [
    'IT Graduate',
    'Game Developer',
    'VR Builder',
    'Outdoor Leader',
    'Technical Problem Solver'
  ];
  let phraseIndex = 0, charIndex = 0, isDeleting = false;

  function type() {
    const current = phrases[phraseIndex];
    if (isDeleting) {
      typedEl.innerHTML = '&gt; ' + current.substring(0, charIndex - 1) + '<span class="cursor"></span>';
      charIndex--;
    } else {
      typedEl.innerHTML = '&gt; ' + current.substring(0, charIndex + 1) + '<span class="cursor"></span>';
      charIndex++;
    }

    let speed = isDeleting ? 40 : 80;

    if (!isDeleting && charIndex === current.length) {
      speed = 2000;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      speed = 400;
    }

    setTimeout(type, speed);
  }
  type();
}

/* ==============================
   Scroll reveal + skill bars
   ============================== */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      entry.target.querySelectorAll('.skill-fill').forEach(bar => {
        bar.style.width = bar.getAttribute('data-width') + '%';
      });
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

/* ==============================
   Fullscreen toggle for game embeds
   ============================== */
function toggleFullscreen(iframeId) {
  const iframe = document.getElementById(iframeId);
  if (iframe.requestFullscreen) {
    iframe.requestFullscreen();
  } else if (iframe.webkitRequestFullscreen) {
    iframe.webkitRequestFullscreen();
  }
}