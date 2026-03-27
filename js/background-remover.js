document.addEventListener('DOMContentLoaded', () => {
    let currentFile = null;
    let currentObjectUrl = null;
    const processingUI = new ProcessingUI('.tool-workspace');

    const settingsPanel = document.getElementById('settings-panel');
    const resultArea = document.getElementById('result-area');
    const processBtn = document.getElementById('process-btn');
    const downloadBtn = document.getElementById('download-btn');

    const previewOriginal = document.getElementById('preview-original');
    const previewResult = document.getElementById('preview-result');

    // Background color options
    let bgMode = 'transparent';
    const bgTransparentBtn = document.getElementById('bg-transparent');
    const bgWhiteBtn = document.getElementById('bg-white');
    const bgCustomBtn = document.getElementById('bg-custom');
    const customColorInput = document.getElementById('custom-color');

    const bgBtns = [bgTransparentBtn, bgWhiteBtn, bgCustomBtn];

    bgBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                bgBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                bgMode = btn.getAttribute('data-bg');
                if (bgMode === 'custom') {
                    customColorInput.style.display = 'block';
                } else {
                    customColorInput.style.display = 'none';
                }
            });
        }
    });

    // Handle File Selection
    window.setupDragAndDrop('upload-area', 'file-input', (file) => {
        if (!file.type.match(/image\/(jpeg|png|webp)/)) {
            alert('Please select a JPG, PNG, or WEBP image.');
            return;
        }
        currentFile = file;
        document.querySelector('.upload-label').textContent = file.name;
        settingsPanel.style.display = 'block';
        resultArea.style.display = 'none';

        // Cleanup previous object url if any
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
        }
        
        // Show original preview
        currentObjectUrl = URL.createObjectURL(file);
        previewOriginal.src = currentObjectUrl;
    });

    // Process Image
    if (processBtn) {
        processBtn.addEventListener('click', async () => {
            if (!currentFile) return;

            // Using @imgly/background-removal
            // The first time this runs, it will download the WASM models (around 40MB).
            // We'll update the progress text to reflect this.
            processingUI.show('Starting AI Model...', 'First time might take a bit longer to download models (approx 40MB). Please wait.');
            processBtn.disabled = true;

            try {
                // Prepare options with a progress callback
                const config = {
                    progress: (key, current, total) => {
                        // The library calls this during download and processing
                        // key is usually 'fetch:model' or 'compute:inference'
                        let percent = 0;
                        if (total > 0) {
                            percent = Math.round((current / total) * 100);
                        } else {
                            // If total is 0 or undefined, maybe just estimate or show current bytes
                            percent = Math.min(Math.round(current * 100), 100); 
                        }

                        if (key.includes('fetch')) {
                            processingUI.setProgress(Math.min(percent, 70)); // cap fetch at 70%
                            document.querySelector('.processing-subtitle').textContent = `Downloading AI models... ${percent}%`;
                        } else if (key.includes('compute')) {
                            document.querySelector('.processing-subtitle').textContent = `Removing background...`;
                            document.querySelector('.processing-text').textContent = 'Processing Image';
                            processingUI.setProgress(70 + (percent * 0.25)); // from 70 to 95%
                        }
                    }
                };

                // Run the background removal!
                const blob = await imglyRemoveBackground(currentObjectUrl, config);
                
                processingUI.setProgress(95);
                document.querySelector('.processing-subtitle').textContent = 'Finalizing Image...';

                // We have a transparent blob now. If the user wanted a different color background, we must draw it.
                if (bgMode === 'white' || bgMode === 'custom') {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    const img = new Image();
                    img.src = URL.createObjectURL(blob);
                    
                    await new Promise(resolve => {
                        img.onload = () => {
                            canvas.width = img.width;
                            canvas.height = img.height;
                            
                            // Fill background
                            ctx.fillStyle = bgMode === 'white' ? '#ffffff' : customColorInput.value;
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            
                            // Draw transparent image over it
                            ctx.drawImage(img, 0, 0);
                            resolve();
                        };
                    });
                    
                    const coloredBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const resultUrl = URL.createObjectURL(coloredBlob);
                    
                    previewResult.src = resultUrl;
                    downloadBtn.href = resultUrl;
                    downloadBtn.download = 'bg_removed_' + currentFile.name.replace(/\.[^.]+$/, '.png');
                    
                } else {
                    // Transparent Background
                    const resultUrl = URL.createObjectURL(blob);
                    previewResult.src = resultUrl;
                    downloadBtn.href = resultUrl;
                    downloadBtn.download = 'bg_removed_' + currentFile.name.replace(/\.[^.]+$/, '.png');
                }

                processingUI.setProgress(100);
                setTimeout(() => {
                    processingUI.hide();
                    resultArea.style.display = 'block';
                }, 400);

                processBtn.disabled = false;

            } catch (e) {
                console.error(e);
                processingUI.hide();
                alert('An error occurred during AI background removal. It may require a more modern browser or WebGL support.');
                processBtn.disabled = false;
            }
        });
    }
});
