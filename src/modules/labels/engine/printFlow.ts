/**
 * Preview → print → confirm (owner G2 correction handout §23–§24). Pure state machine for the Preview screen.
 *
 *  - The confirmation question ("Did the labels print correctly?") is NEVER shown on the first preview. It appears
 *    only after the user tapped Print, the system print dialog opened, and the app came back to the foreground.
 *  - Answers: "Yes, printed" (confirm) · "Keep waiting" (labels stay in the queue) · "Print again".
 *  - Share PDF never asks, never clears the queue and never marks anything printed: sharing is not printing.
 *  - Preview, print and share all use the same generated PDF (one authoritative file, identified by its SHA-256).
 */
export type PrintFlowState =
  | { phase: 'preview'; pdfSha256: string }
  | { phase: 'printDialogOpen'; pdfSha256: string }
  | { phase: 'askConfirmation'; pdfSha256: string }
  | { phase: 'confirmed'; pdfSha256: string }
  | { phase: 'keptWaiting'; pdfSha256: string };

export type PrintFlowEvent =
  | { type: 'tapPrint' }
  | { type: 'returnedFromPrintDialog' }
  | { type: 'answerPrinted' }
  | { type: 'answerKeepWaiting' }
  | { type: 'answerPrintAgain' }
  | { type: 'tapShare' };

export const startPreview = (pdfSha256: string): PrintFlowState => ({ phase: 'preview', pdfSha256 });

export function printFlow(state: PrintFlowState, event: PrintFlowEvent): PrintFlowState {
  const { pdfSha256 } = state;
  switch (event.type) {
    case 'tapShare': return state; // sharing changes nothing: no question, no queue change, nothing marked printed
    case 'tapPrint': return state.phase === 'confirmed' ? state : { phase: 'printDialogOpen', pdfSha256 };
    case 'returnedFromPrintDialog': return state.phase === 'printDialogOpen' ? { phase: 'askConfirmation', pdfSha256 } : state;
    case 'answerPrinted': return state.phase === 'askConfirmation' ? { phase: 'confirmed', pdfSha256 } : state;
    case 'answerKeepWaiting': return state.phase === 'askConfirmation' ? { phase: 'keptWaiting', pdfSha256 } : state;
    case 'answerPrintAgain': return state.phase === 'askConfirmation' ? { phase: 'printDialogOpen', pdfSha256 } : state;
  }
}

/** Only an explicit "Yes, printed" after a real print attempt may mark labels printed and clear them from the queue. */
export const marksPrinted = (s: PrintFlowState): boolean => s.phase === 'confirmed';
export const showsConfirmationQuestion = (s: PrintFlowState): boolean => s.phase === 'askConfirmation';
