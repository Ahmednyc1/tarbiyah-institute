import "server-only";

/**
 * "Is this really you?" — the only message sent to an address nobody has
 * proved yet.
 *
 * IT SAYS ALMOST NOTHING, AND THAT IS THE POINT. Until the link is clicked the
 * recipient might be a stranger who happens to own the address somebody
 * mistyped. So: no course name, no schedule, no money, no student's full name.
 * Just that this address was given to the institute, and a way to say yes.
 *
 * The real welcome follows once the address is proved, and that one can say
 * everything.
 */

export type AddressConfirmationContext = {
  firstName: string;
  confirmUrl: string;
  /** Local time the link dies, already formatted — the email states it plainly. */
  expiresWording: string;
};

const INSTITUTE = "MAS Tarbiya Institute";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function addressConfirmation(ctx: AddressConfirmationContext): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = ctx.firstName.trim() || "there";
  const subject = `Please confirm your email address — ${INSTITUTE}`;

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4ef;margin:0;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dddcd2;border-radius:10px;">
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <p style="margin:0 0 6px 0;color:#1d4a33;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;">${INSTITUTE}</p>
            <h1 style="margin:0;color:#1a211d;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;line-height:1.2;">Is this your address?</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 0 32px;color:#1a211d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 14px 0;">Assalamu alaikum ${esc(firstName)},</p>
            <p style="margin:0 0 18px 0;">
              This address was given to ${INSTITUTE} when somebody was registered for a course.
              Please confirm it so we can send you your course details, marks and class notices.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:#1d4a33;border-radius:7px;">
                <a href="${esc(ctx.confirmUrl)}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">Yes, this is me</a>
              </td>
            </tr></table>
            <p style="margin:18px 0 0 0;color:#96480f;font-size:14px;font-weight:500;">
              This link stops working in 24 hours &mdash; ${esc(ctx.expiresWording)}.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #dddcd2;margin:0 0 16px 0;" />
            <p style="margin:0 0 10px 0;color:#5b635b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;">
              If this does not mean anything to you, somebody has most likely mistyped their own
              address. You can ignore this message &mdash; nothing happens if you do, and you will
              not hear from us again.
            </p>
            <p style="margin:0;color:#8d948d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;">
              If the button does not work, paste this into your browser:<br />${esc(ctx.confirmUrl)}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  const text = [
    `Assalamu alaikum ${firstName},`,
    ``,
    `This address was given to ${INSTITUTE} when somebody was registered for a`,
    `course. Please confirm it so we can send you your course details, marks`,
    `and class notices:`,
    ``,
    ctx.confirmUrl,
    ``,
    `This link stops working in 24 hours — ${ctx.expiresWording}.`,
    ``,
    `If this does not mean anything to you, somebody has most likely mistyped`,
    `their own address. You can ignore this message — nothing happens if you`,
    `do, and you will not hear from us again.`,
  ].join("\n");

  return { subject, html, text };
}
