const backToTopButton = document.createElement("button");
const siteFooter = document.querySelector(".site-footer");
const iconNamespace = "http://www.w3.org/2000/svg";
const backToTopIcon = document.createElementNS(iconNamespace, "svg");
const backToTopPath = document.createElementNS(iconNamespace, "path");

backToTopButton.className = "back-to-top";
backToTopButton.type = "button";
backToTopButton.hidden = true;
backToTopButton.setAttribute("aria-label", "Back to top");
backToTopButton.title = "Back to top";
backToTopButton.setAttribute("aria-hidden", "true");

backToTopIcon.setAttribute("viewBox", "0 0 24 24");
backToTopIcon.setAttribute("aria-hidden", "true");
backToTopIcon.setAttribute("focusable", "false");
backToTopPath.setAttribute("d", "M11 20V7.83l-4.59 4.58L5 11l7-7 7 7-1.41 1.41L13 7.83V20z");
backToTopPath.setAttribute("fill", "currentColor");
backToTopIcon.append(backToTopPath);
backToTopButton.append(backToTopIcon);

document.body.append(backToTopButton);

function updateBackToTopVisibility() {
  const shouldShow = window.scrollY > 320;
  const footerTop = siteFooter ? siteFooter.getBoundingClientRect().top : null;
  const footerClearance =
    footerTop !== null && footerTop < window.innerHeight
      ? window.innerHeight - footerTop + 16
      : 0;

  backToTopButton.hidden = !shouldShow;
  backToTopButton.setAttribute("aria-hidden", String(!shouldShow));
  backToTopButton.style.setProperty(
    "--back-to-top-footer-clearance",
    `${footerClearance}px`
  );
}

backToTopButton.addEventListener("click", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion ? "auto" : "smooth"
  });
});

window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
window.addEventListener("resize", updateBackToTopVisibility);
updateBackToTopVisibility();
