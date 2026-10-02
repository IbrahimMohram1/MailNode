const escapeHtml = (v) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function buildContactEmail({
  name,
  email,
  message,
  companyName,
  companyLogoUrl,
  brandColor,
}) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
  const safeCompanyName = escapeHtml(companyName);

  const date = `${new Date().toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;


  const logoHtml = companyLogoUrl
    ? `
      <img
        src="${escapeHtml(companyLogoUrl)}"
        alt="${safeCompanyName}"
        width="auto"
        height="40"
        style="
          display:block;
          height:40px;
          width:auto;
          max-width:240px;
          
          border:0;
          outline:none;
          text-decoration:none;
        "
      />
    `
    : `
      <span
        style="
          font-size:20px;
          line-height:40px;
          font-weight:700;
          color:#ffffff;
        "
      >
        ${safeCompanyName}
      </span>
    `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Contact Message</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background-color:#f3f4f6;
    font-family:'Segoe UI',Arial,Helvetica,sans-serif;
  "
>

  <div
    style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
      color:transparent;
    "
  >
    New message from ${safeName} via your website contact form.
  </div>

  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
      width:100%;
      background-color:#f3f4f6;
      padding:32px 12px;
    "
  >
    <tr>
      <td align="center">

        <table
          role="presentation"
          width="600"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            max-width:600px;
            background-color:#ffffff !important;
            border-radius:12px;
            overflow:hidden;
          "
        >

          <!-- HEADER -->
          <tr>
            <td
              align="left"
              valign="middle"
              style="
                background-color:${brandColor};
                padding:20px 32px;
              "
            >
              ${logoHtml}
            </td>
          </tr>

          <!-- TITLE -->
          <tr>
            <td style="padding:32px 32px 8px 32px;">

              <p
                style="
                  margin:0 0 6px 0;
                  font-size:12px;
                  line-height:18px;
                  letter-spacing:1px;
                  text-transform:uppercase;
                  color:#000;
                  font-weight:700;
                "
              >
                New Inquiry
              </p>

              <h1
                style="
                  margin:0;
                  font-size:24px;
                  line-height:1.3;
                  color:#111827;
                  font-weight:700;
                "
              >
                You have a new contact message
              </h1>

              <p
                style="
                  margin:8px 0 0 0;
                  font-size:13px;
                  line-height:20px;
                  color:#6b7280;
                "
              >
                Received on ${date}
              </p>

            </td>
          </tr>

          <!-- SENDER -->
          <tr>
            <td style="padding:24px 32px 8px 32px;">

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  width:100%;
                  background-color:#f9fafb;
                  border:1px solid #e5e7eb;
                  border-radius:8px;
                "
              >

                <tr>
                  <td
                    style="
                      padding:16px 20px;
                      border-bottom:1px solid #e5e7eb;
                    "
                  >
                    <p
                      style="
                        margin:0;
                        font-size:11px;
                        text-transform:uppercase;
                        letter-spacing:0.8px;
                        color:#6b7280;
                      "
                    >
                      Name
                    </p>

                    <p
                      style="
                        margin:4px 0 0 0;
                        font-size:16px;
                        color:#111827;
                        font-weight:600;
                      "
                    >
                      ${safeName}
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:16px 20px;">

                    <p
                      style="
                        margin:0;
                        font-size:11px;
                        text-transform:uppercase;
                        letter-spacing:0.8px;
                        color:#6b7280;
                      "
                    >
                      Email
                    </p>

                    <p
                      style="
                        margin:4px 0 0 0;
                        font-size:16px;
                      "
                    >
                      <a
                        href="mailto:${safeEmail}"
                        style="
                          color:#000;
                          text-decoration:none;
                          font-weight:600;
                        "
                      >
                        ${safeEmail}
                      </a>
                    </p>

                  </td>
                </tr>

              </table>

            </td>
          </tr>

          <!-- MESSAGE -->
          <tr>
            <td style="padding:16px 32px 8px 32px;">

              <p
                style="
                  margin:0 0 8px 0;
                  font-size:11px;
                  text-transform:uppercase;
                  letter-spacing:0.8px;
                  color:#6b7280;
                "
              >
                Message
              </p>

              <div
                style="
                  border-left:4px solid ${brandColor};
                  background-color:#f9fafb;
                  padding:16px 20px;
                  border-radius:0 8px 8px 0;
                  font-size:15px;
                  line-height:1.7;
                  color:#374151;
                "
              >
                ${safeMessage}
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              style="
                background-color:#f9fafb;
                border-top:1px solid #e5e7eb;
                padding:20px 32px;
              "
            >
              <p
                style="
                  margin:0;
                  font-size:12px;
                  line-height:1.6;
                  color:#9ca3af;
                "
              >
                This message was sent from the contact form on your website.
                Hitting <b>Reply</b> will respond directly to the sender.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = { buildContactEmail };
