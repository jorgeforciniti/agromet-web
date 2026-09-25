import { Directive, ElementRef, OnDestroy, AfterViewInit, Input } from '@angular/core';

/**
 * Agrega la clase `is-visible` (definida en styles.css junto con `.reveal`) la primera vez
 * que el elemento entra en el viewport, y deja de observar. Sin animación si el usuario
 * pidió prefers-reduced-motion (eso ya lo maneja el CSS, acá solo evitamos el delay escalonado).
 */
@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
  host: { class: 'reveal' }
})
export class ScrollRevealDirective implements AfterViewInit, OnDestroy {
  @Input('appScrollReveal') delayMs = 0;

  private observer?: IntersectionObserver;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      this.el.nativeElement.classList.add('is-visible');
      return;
    }

    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const delay = this.delayMs || 0;
          setTimeout(() => this.reveal(), delay);
          this.observer?.disconnect();
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    this.observer.observe(this.el.nativeElement);
  }

  /**
   * Una vez terminada la transición, saca la clase `reveal` por completo (no solo
   * agrega `is-visible`) para que no compita en especificidad con los `:hover`/
   * `transform` propios del componente que la usa.
   */
  private reveal(): void {
    const node = this.el.nativeElement;
    node.classList.add('is-visible');
    node.addEventListener('transitionend', () => node.classList.remove('reveal', 'is-visible'), { once: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
