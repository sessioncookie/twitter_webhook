document.getElementById('followForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // 阻止預設表單提交

    const followUser = document.getElementById('follow_user').value;
    const webhookUrl = document.getElementById('webhook_url').value;
    const notify = document.getElementById('notify').value;
    const messageElement = document.getElementById('message');
    const submitButton = document.querySelector('.submit-button'); // 選取提交按鈕

    // 檢查表單欄位
    if (!followUser || !webhookUrl || !notify) {
        const errorMessage = '請填寫所有欄位';
        messageElement.textContent = errorMessage;
        messageElement.classList.add('text-red-500');
        window.alert(errorMessage);
        return;
    }

    // 禁用提交按鈕
    submitButton.disabled = true;
    submitButton.textContent = '提交中...'; // 可選：更改按鈕文字提示正在處理

    // 構建 JSON 物件
    const requestBody = {
        follow_user: followUser,
        webhook_url: webhookUrl,
        notify: notify
    };

    try {
        // 發送 POST 請求
        const response = await fetch('/add-follow/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        // 如果響應的內容類型不是 JSON，則可能是驗證頁面
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            // 檢測到HTML內容，假設是驗證頁面
            window.location.href = '/verify-page'; // 替換為實際的驗證頁面URL
            return;
        }

        const result = await response.json();

        if (response.ok) {
            // 請求成功
            messageElement.textContent = result.message || '成功';
            messageElement.classList.remove('text-red-500');
            messageElement.classList.add('text-green-500');
            document.getElementById('followForm').reset();
        } else {
            // 後端錯誤
            const errorMessage = result.detail || '提交資料時發生錯誤';
            messageElement.textContent = errorMessage;
            messageElement.classList.remove('text-green-500');
            messageElement.classList.add('text-red-500');
            window.alert('錯誤: ' + errorMessage);
        }
    } catch (error) {
        // 請求失敗
        const errorMessage = '錯誤: ' + error.message;
        messageElement.textContent = errorMessage;
        messageElement.classList.remove('text-green-500');
        messageElement.classList.add('text-red-500');
        window.alert(errorMessage);
    } finally {
        // 無論成功或失敗，重新啟用按鈕
        submitButton.disabled = false;
        submitButton.textContent = '提交'; // 恢復按鈕文字
    }
});

// Tutorial button and modal handling
const tutorialButton = document.getElementById('tutorialButton');
const tutorialModal = document.getElementById('tutorialModal');
const closeModalButton = document.getElementById('closeModal');

if (tutorialButton) {
    tutorialButton.addEventListener('click', () => {
        tutorialModal.classList.remove('hidden');
    });
}

if (closeModalButton) {
    closeModalButton.addEventListener('click', () => {
        tutorialModal.classList.add('hidden');
    });
}

if (tutorialModal) {
    tutorialModal.addEventListener('click', (event) => {
        if (event.target === tutorialModal) {
            tutorialModal.classList.add('hidden');
        }
    });
}
