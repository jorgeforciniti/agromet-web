import { Directive, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';

/**
 * Anima el número mostrado desde 0 hasta el valor final cuando llega el dato real
 * (en vez de aparecer "de golpe"). Puramente informativo, no decorativo: ayuda a notar
 * que el valor es nuevo/recién cargado. Respeta prefers-reduced-motion.
 */
@Directive({
  selector: '[appCountUp]',
  standalone: true
})
export class CountUpDirective implements OnChanges {
  @Input('appCountUp') target: number | null = null;
  @Input() countUpDuration = 900;
  @Input() countUpDecimals = 0;
  @Input() countUpSuffix = '';

  private rafId?: number;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ('target' in changes && this.target != null && !isNaN(this.target)) {
      this.animateTo(this.target);
    }
  }

  private animateTo(target: number): void {
    const reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || typeof requestAnimationFrame === 'undefined') {
      this.render(target);
      return;
    }

    if (this.rafId) cancelAnimationFrame(this.rafId);

    const start = performance.now();
    const duration = this.countUpDuration;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.render(target * eased);
      if (t < 1) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.render(target);
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  private render(value: number): void {
    this.el.nativeElement.textContent = value.toFixed(this.countUpDecimals) + this.countUpSuffix;
  }
}
