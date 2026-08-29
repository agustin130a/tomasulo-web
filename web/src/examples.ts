/**
 * Index of bundled example programs. Files live in public/asm/ and are fetched
 * at runtime relative to import.meta.env.BASE_URL so they work under the
 * GitHub Pages project base path.
 */
export interface Example {
  file: string;
  label: string;
  description: string;
}

export const EXAMPLES: Example[] = [
  { file: 'ejemplo_pdf.s', label: 'Ejemplo canónico (PDF)', description: 'Secuencia clásica de Tomasulo: LD, MUL, SUB, DIV, ADD con dependencias.' },
  { file: 'bucle_simple_pdf.s', label: 'Bucle simple (PDF)', description: 'x(i) = x(i) + s: LD, ADDD, SD, SUBI, BNEZ.' },
  { file: 'bucle_desenrollado_pdf.s', label: 'Bucle desenrollado (PDF)', description: 'Loop unrolling del bucle simple.' },
  { file: 'factorial.s', label: 'Factorial', description: 'Rutina de factorial con saltos.' },
  { file: 'floatingFUexample.s', label: 'Floating FU', description: 'Prueba de unidades de punto flotante (MUL/DIV).' },
  { file: 'flt.s', label: 'Float test', description: 'Cadena de operaciones flotantes con dependencias RAW.' },
  { file: 'hail.s', label: 'Hailstone', description: 'Secuencia de Collatz con saltos condicionales.' },
];
