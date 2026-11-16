import React, { useEffect, useMemo, useRef, useState } from "react";
import { Carousel, Button, Modal } from "react-bootstrap";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import axiosInstance from "./AxiosInstance";
import { safeHttpUrl } from "../utils/urlSafety";

// Styles for the ad popup modal: a fixed-height letterboxed image with the
// title / description / CTA below it. Auto-advances while the modal is open.
const ADS_CSS = `
/* This popup is designed for a LIGHT header, but a global rule
   (RoomList.css) forces every .modal-header to a red gradient with white
   text — which hides the "Sponsored" title and clashes with the white nav
   buttons. Scope the header back to a clean light bar for this modal only. */
.hs-ads-modal .modal-header {
  background: #fff; color: inherit;
  border-bottom: 1px solid #E5E5E1; border-radius: 0;
}
.hs-ads-modal .modal-header .btn-close { filter: none; opacity: .6; }
.hs-ads-modal .modal-header .btn-close:hover { opacity: 1; }

.hs-ads-modal { max-width: 600px; }
.hs-ads-modal .modal-body { padding: 0; }

/* Hero slide: the image is the full background; the text + button are overlaid
   on a dark gradient scrim at the bottom — no empty white space below. */
.hs-ads-slide { position: relative; height: 380px; overflow: hidden; }
.hs-ads-img {
  position: absolute; inset: 0; cursor: pointer; background: #f6f6f4;
}
.hs-ads-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hs-ads-fallback {
  position: absolute; inset: 0;
  background: linear-gradient(135deg,#4f46e5,#7c3aed);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 600; text-align: center; padding: 12px;
}
.hs-ads-meta {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 3;
  padding: 56px 24px 22px; color: #fff; pointer-events: none;
  background: linear-gradient(to top,
    rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,0) 100%);
}
/* parent scrim is click-through (so the image stays clickable); re-enable
   pointer events on the actual button. */
.hs-ads-meta .btn { pointer-events: auto; }
.hs-ads-title { font-size: 1.15rem; font-weight: 700; line-height: 1.25; }
.hs-ads-desc { color: rgba(255,255,255,.88); font-size: .9rem; }

/* Prev/next arrows overlaid on the image (vertically centered over it), the
   conventional carousel pattern — instead of floating in the header. */
.hs-ads-carousel { position: relative; }
.hs-ads-nav {
  position: absolute; z-index: 5;
  top: 42%; transform: translateY(-50%);
  border: none; background: rgba(255, 255, 255, 0.92); color: #EC0B43;
  width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: background .15s ease, color .15s ease;
}
.hs-ads-nav:hover { background: #EC0B43; color: #fff; }
.hs-ads-nav.prev { left: 12px; }
.hs-ads-nav.next { right: 12px; }

/* Move the carousel dots to the top so they don't sit on the bottom text. */
.hs-ads-modal .carousel-indicators { top: 10px; bottom: auto; margin-bottom: 0; }

/* Compact footer — minimal white space around the OK button. */
.hs-ads-modal .modal-footer { padding: 8px 14px; border-top: 1px solid #EEE; }

@media (max-width: 575.98px) {
  .hs-ads-slide { height: 300px; }
  .hs-ads-meta { padding: 48px 18px 18px; }
}
`;

/**
 * Sponsored-ad popup, shown automatically on page load.
 *
 * Ads are fetched from /api/advertisement/active. When a city is selected
 * (cityId), the backend returns that city's ads first, then the remaining
 * active ads. Each ad may have several images, so the carousel shows one
 * slide per image (keeping ads — and the city-first order — together).
 *
 * Behaviour: a centered modal opens once on first load (when ads are
 * available) with a 3-second auto-advancing carousel. The prev/next arrows
 * step manually. An OK button (and the close X) dismisses the popup.
 *
 * Impressions/views are recorded for whichever slide is visible while the
 * popup is open; clicks are recorded when an ad is clicked (and its target
 * URL, if any, is opened).
 */
export default function AdvertisementCarousel({ cityId, cityName }) {
  const [ads, setAds] = useState([]);
  const [index, setIndex] = useState(0);
  // Popup visibility. Opens once automatically when ads first load (tracked by
  // autoShownRef) so re-fetching on a city change doesn't keep reopening it.
  const [show, setShow] = useState(false);
  const autoShownRef = useRef(false);
  const impressedRef = useRef(new Set());
  // Ads whose "view" we've already POSTed this mount (the backend further
  // dedupes per login-session + page, so repeats are harmless no-ops).
  const viewedRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    const fetchAds = async () => {
      try {
        const params = cityId ? `?cityId=${cityId}` : "";
        const res = await axiosInstance.get(
          `/api/advertisement/active${params}`,
        );
        if (cancelled) return;
        setAds(Array.isArray(res.data) ? res.data : []);
        setIndex(0);
        impressedRef.current = new Set();
        viewedRef.current = new Set();
      } catch (err) {
        if (!cancelled) setAds([]);
      }
    };
    fetchAds();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  // One slide per image; ads with no image still get a single (fallback) slide.
  const slides = useMemo(() => {
    const out = [];
    ads.forEach((ad) => {
      const imgs =
        Array.isArray(ad.imageUrls) && ad.imageUrls.length > 0
          ? ad.imageUrls
          : ad.imageUrl
            ? [ad.imageUrl]
            : [null];
      imgs.forEach((img) => out.push({ ad, img }));
    });
    return out;
  }, [ads]);

  // Keep the index in range if the slide list shrinks.
  useEffect(() => {
    setIndex((i) => (slides.length === 0 ? 0 : i % slides.length));
  }, [slides.length]);

  // Auto-open the popup the first time ads become available.
  useEffect(() => {
    if (slides.length > 0 && !autoShownRef.current) {
      autoShownRef.current = true;
      setShow(true);
    }
  }, [slides.length]);

  const recordImpression = (ad) => {
    if (!ad || impressedRef.current.has(ad.advertisementId)) return;
    impressedRef.current.add(ad.advertisementId);
    axiosInstance
      .post(`/api/advertisement/${ad.advertisementId}/impression`)
      .catch(() => {});
  };

  // Record a "view": counted once per ad per (login session, page). The
  // session id is minted on login; the page is the current route path. The
  // backend enforces the once-per-(session,page) rule, so re-visiting the same
  // page in the same login does not increase the count, but a fresh login does.
  const recordView = (ad) => {
    if (!ad || viewedRef.current.has(ad.advertisementId)) return;
    const sessionId = sessionStorage.getItem("adSessionId");
    if (!sessionId) return; // not logged in via the normal flow — skip
    viewedRef.current.add(ad.advertisementId);
    axiosInstance
      .post(`/api/advertisement/${ad.advertisementId}/view`, {
        sessionId,
        pageKey: window.location.pathname,
      })
      .catch(() => {});
  };

  // Record an impression + a view for whatever slide is visible while the
  // popup is open.
  useEffect(() => {
    if (show && slides[index]) {
      recordImpression(slides[index].ad);
      recordView(slides[index].ad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slides, show]);

  // Self-managed auto-advance while the popup is open. Re-arms on every index
  // change (so manual prev/next also resets the 3-second countdown).
  useEffect(() => {
    if (!show || slides.length <= 1) return undefined;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 3000);
    return () => clearTimeout(t);
  }, [index, slides.length, show]);

  const goPrev = () =>
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  const goNext = () => setIndex((i) => (i + 1) % slides.length);

  const handleClick = (ad) => {
    axiosInstance
      .post(`/api/advertisement/${ad.advertisementId}/click`)
      .catch(() => {});
    // Only web links open: a "javascript:" / "data:" target saved on the
    // ad is ignored instead of running inside this logged-in page.
    const url = safeHttpUrl(ad.targetUrl);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (slides.length === 0) return null;

  const hasMany = slides.length > 1;
  const close = () => setShow(false);

  return (
    <>
      <style>{ADS_CSS}</style>
      <Modal
        show={show}
        onHide={close}
        centered
        backdrop="static"
        keyboard={false}
        dialogClassName="hs-ads-modal"
      >
        <Modal.Header closeButton className="py-2">
          <Modal.Title className="h6 mb-0 d-flex align-items-center gap-2">
            <span className="fw-semibold text-primary">Sponsored</span>
            {cityName ? (
              <span className="text-muted fw-normal small">
                · {cityName.split(",")[0]}
              </span>
            ) : null}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <div className="hs-ads-carousel">
          {hasMany && (
            <>
              <button
                type="button"
                className="hs-ads-nav prev"
                onClick={goPrev}
                aria-label="Previous ad"
              >
                <FaChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="hs-ads-nav next"
                onClick={goNext}
                aria-label="Next ad"
              >
                <FaChevronRight size={14} />
              </button>
            </>
          )}
          <Carousel
            activeIndex={index}
            onSelect={(i) => setIndex(i)}
            interval={null}
            controls={false}
            indicators={hasMany}
          >
            {slides.map(({ ad, img }, i) => (
              <Carousel.Item key={`${ad.advertisementId}-${i}`}>
                <div className="hs-ads-slide">
                  <div className="hs-ads-meta">
                    <div className="hs-ads-title">{ad.title}</div>
                    {ad.description ? (
                      <div className="hs-ads-desc mt-2">{ad.description}</div>
                    ) : null}
                    <div>
                      <Button
                        size="sm"
                        className="mt-3 btn-indigo"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClick(ad);
                        }}
                      >
                        {ad.buttonText || "Learn More"}
                      </Button>
                    </div>
                  </div>
                  {img ? (
                    <div
                      className="hs-ads-img"
                      title="Click to open"
                      onClick={() => handleClick(ad)}
                    >
                      <img
                        src={img}
                        alt={ad.title}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="hs-ads-fallback">{ad.title}</div>
                  )}
                </div>
              </Carousel.Item>
            ))}
          </Carousel>
          </div>
        </Modal.Body>

        <Modal.Footer className="py-2">
          <Button variant="primary" onClick={close} className="px-4">
            OK
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
