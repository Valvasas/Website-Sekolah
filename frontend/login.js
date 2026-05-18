document.addEventListener('DOMContentLoaded', () => {
    const roleButtons = document.querySelectorAll('.role-btn');
    const roleForms = document.querySelectorAll('.role-form');

    roleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            const targetForm = document.getElementById(targetId);

            if (!targetForm) return;

            roleButtons.forEach(item => item.classList.remove('active'));
            roleForms.forEach(form => form.classList.remove('active'));

            button.classList.add('active');
            targetForm.classList.add('active');
        });
    });
});

function toggleView(viewId) {
    const loginArea = document.getElementById('loginArea');
    const forgotArea = document.getElementById('forgotArea');
    const targetView = document.getElementById(viewId);

    if (!loginArea || !forgotArea || !targetView) return;

    loginArea.style.display = viewId === 'loginArea' ? '' : 'none';
    forgotArea.style.display = viewId === 'forgotArea' ? '' : 'none';
}
