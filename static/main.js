document.getElementById('followForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // 阻止預設表單提交

    const followUser = document.getElementById('follow_user').value;
    const webhookUrl = document.getElementById('webhook_url').value;
    const notify = document.getElementById('notify').value;
    const messageElement = document.getElementById('message');

    // 檢查表單欄位
    if (!followUser || !webhookUrl || !notify) {
        const errorMessage = '請填寫所有欄位';
        messageElement.textContent = errorMessage;
        messageElement.classList.add('text-red-500');
        window.alert(errorMessage);
        return;
    }

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