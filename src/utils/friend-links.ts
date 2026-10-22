/**
 * 友链页交互：本站名片复制 + 友链申请弹窗（从 links.astro 内联脚本抽出）。
 *
 * 页面上的复制按钮通过 data-card-info / data-copy-done 提供文案；
 * 弹窗通过 [data-open-link-apply] / [data-close-link-apply] 控制。
 */

export function initFriendLinksPage(): void {
  const copyBtn = document.getElementById('copy-site-card-btn') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const info = copyBtn.dataset.cardInfo ?? '';
      const done = copyBtn.dataset.copyDone ?? '已复制本站名片';
      if (info) navigator.clipboard?.writeText(info).catch(() => {});
      const orig = copyBtn.textContent ?? '';
      copyBtn.textContent = done;
      setTimeout(() => {
        copyBtn.textContent = orig;
      }, 2200);
    });
  }

  const modal = document.getElementById('link-apply-modal');
  const form = document.getElementById('link-apply-form') as HTMLFormElement | null;
  const statusEl = document.getElementById('link-apply-status');
  const submitBtn = document.getElementById('link-apply-submit-btn') as HTMLButtonElement | null;

  function setModalOpen(open: boolean): void {
    if (!modal) return;
    if (open) {
      modal.dataset.open = 'true';
      modal.setAttribute('aria-hidden', 'false');
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.removeAttribute('data-type');
      }
      setTimeout(() => {
        form?.querySelector<HTMLInputElement>('input[name="owner"]')?.focus();
      }, 60);
    } else {
      delete modal.dataset.open;
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  document.querySelectorAll('[data-open-link-apply]').forEach((btn) => {
    btn.addEventListener('click', () => setModalOpen(true));
  });

  document.querySelectorAll('[data-close-link-apply]').forEach((btn) => {
    btn.addEventListener('click', () => setModalOpen(false));
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) setModalOpen(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.dataset.open === 'true') {
      setModalOpen(false);
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!submitBtn) return;

    const fd = new FormData(form);
    const payload = {
      owner: String(fd.get('owner') || '').trim(),
      name: String(fd.get('name') || '').trim(),
      url: String(fd.get('url') || '').trim(),
      tag: String(fd.get('tag') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      website: String(fd.get('website') || '').trim(),
      honeypot: String(fd.get('honeypot') || '').trim(),
    };

    if (!payload.owner || !payload.name || !payload.url || !payload.description) {
      if (statusEl) {
        statusEl.dataset.type = 'error';
        statusEl.textContent = '请完整填写站长称呼、站点标题、站点链接与自我介绍。';
      }
      return;
    }
    if (!/^https?:\/\//i.test(payload.url)) {
      payload.url = `https://${payload.url}`;
    }

    submitBtn.disabled = true;
    const origText = submitBtn.textContent ?? '';
    submitBtn.textContent = '正在提交…';
    if (statusEl) {
      statusEl.dataset.type = 'info';
      statusEl.textContent = '正在向站点后台发送申请…';
    }

    try {
      const res = await fetch('/api/links/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '提交失败');
      if (statusEl) {
        statusEl.dataset.type = 'ok';
        statusEl.textContent = '✓ 友链申请已成功提交！站长审核通过后将展示在友链列表中。';
      }
      form.reset();
      setTimeout(() => setModalOpen(false), 1200);
    } catch (error) {
      if (statusEl) {
        statusEl.dataset.type = 'error';
        statusEl.textContent = error instanceof Error ? error.message : '提交友链申请失败，请稍后重试。';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  const ensureFriendLinkApplyModal = () => document.getElementById('link-apply-modal');
  (window as unknown as { __YeshengFriendLinks?: unknown }).__YeshengFriendLinks = {
    init: initFriendLinksPage,
    ensureFriendLinkApplyModal,
  };
}
