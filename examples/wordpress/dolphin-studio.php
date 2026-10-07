<?php
/**
 * Plugin Name: DOLPHin Studio
 * Description: Studio IA DOLPHin dans l'administration WordPress (mode proxy).
 * Version: 0.1.0
 */
if (!defined('ABSPATH')) exit;

add_action('admin_menu', function () {
    add_menu_page('DOLPHin', 'DOLPHin', 'manage_options', 'dolphin-studio', 'dolphin_studio_page', 'dashicons-megaphone');
});

add_action('admin_enqueue_scripts', function ($hook) {
    if ($hook !== 'toplevel_page_dolphin-studio') return;
    // Copiez dist/dolphin.lite.js dans le dossier du plugin.
    wp_enqueue_script('dolphin', plugins_url('dolphin.lite.js', __FILE__), [], '0.1.0', true);
});

function dolphin_studio_page() {
    $config = [
        'endpoint' => getenv('DOLPHIN_ENDPOINT') ?: 'https://api.example.com/dolphin',
        'token'    => getenv('DOLPHIN_TOKEN') ?: '',
        'brand'    => [
            'id' => 'wp-' . get_current_blog_id(),
            'name' => get_bloginfo('name'),
            'language' => substr(get_locale(), 0, 2) === 'ar' ? 'ar' : (substr(get_locale(), 0, 2) === 'en' ? 'en' : 'fr'),
            'contact' => ['website' => home_url()],
            'products' => [['name' => get_bloginfo('description') ?: get_bloginfo('name'), 'status' => 'available']],
            'colors' => ['primary' => '#0b3f2f', 'accent' => '#f3811d'],
        ],
    ];
    echo '<div class="wrap"><dolphin-studio><script type="application/json">'
        . wp_json_encode($config, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG)
        . '</script></dolphin-studio></div>';
}
